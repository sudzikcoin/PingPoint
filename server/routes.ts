import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createBrokerSession, getBrokerFromRequest, clearBrokerSession, getOrCreateTrustedDevice, getTrustedDevice, isAdminEmail, getBrokerWithAdminFromRequest } from "./auth";
import { requireAdminAuth, createAdminSession, clearAdminSession, getAdminFromRequest, validateAdminCredentials, isAdminFullyConfigured } from "./admin/adminAuth";
import { randomBytes } from "crypto";
import { insertLoadSchema, insertStopSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { sendBrokerVerificationEmail, sendDriverAppLink } from "./email";
import { strictRateLimit } from "./middleware/rateLimit";
import { shouldAcceptPing, MIN_PING_INTERVAL_MS } from "./utils/rateLimit";
import { checkAndConsumeLoadAllowance, rollbackLoadAllowance, getBillingSummary, FREE_INCLUDED_LOADS } from "./billing/entitlements";
import { createCheckoutSession, createSubscriptionCheckoutSession, createBillingPortalSession, getStripeCustomerByEmail, verifyWebhookSignature, processStripeEvent, grantReferralRewardsIfEligible } from "./billing/stripe";
import { incrementLoadsCreated, getUsageSummary } from "./billing/usage";
import { createProPaymentIntent, checkAndConfirmIntent, getMerchantInfo } from "./billing/solana";
import { evaluateGeofencesForActiveLoad, getGeofenceDebugInfo } from "./geofence";
import { getOrCreateWebhookConfigForUser, updateWebhookConfigForUser, emitLoadEvent } from "./webhooks/webhookService";
import { notifyLoadStatusChange } from "./services/notificationService";
import * as analyticsService from "./services/analyticsService";
import { awardPointsForEvent, getRewardBalance } from "./services/rewardService";
import type { RewardEventType } from "@shared/schema";

const uploadsDir = path.join(process.cwd(), "uploads", "rate-confirmations");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || "";
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

function generateLoadNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `LD-${year}-${random}`;
}

function generateToken(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

// Helper function to apply referral from cookie after login
async function applyReferralFromCookie(req: Request, res: Response, brokerId: string): Promise<void> {
  try {
    const refCode = req.cookies?.pingpoint_ref;
    if (!refCode) {
      return;
    }

    console.log(`[Referral] Found referral cookie: ${refCode} for broker ${brokerId}`);

    // Look up the referrer
    const referrer = await storage.getBrokerByReferralCode(refCode);
    if (!referrer) {
      console.log(`[Referral] Referral code ${refCode} not found, clearing cookie`);
      res.clearCookie("pingpoint_ref", { path: "/" });
      return;
    }

    // Cannot self-refer
    if (referrer.id === brokerId) {
      console.log(`[Referral] Self-referral detected, clearing cookie`);
      res.clearCookie("pingpoint_ref", { path: "/" });
      return;
    }

    // Check if this broker already has a referral
    const existingReferral = await storage.getReferralByReferredId(brokerId);
    if (existingReferral) {
      console.log(`[Referral] Broker already has a referral (status: ${existingReferral.status}), clearing cookie`);
      res.clearCookie("pingpoint_ref", { path: "/" });
      
      // If they already have a pending referral and are now PRO, grant rewards
      if (existingReferral.status === "REGISTERED") {
        const summary = await getBillingSummary(brokerId);
        if (summary.plan === "PRO") {
          await grantReferralRewardsIfEligible(brokerId);
          console.log(`[Referral] Granted rewards for existing pending referral`);
        }
      }
      return;
    }

    // Get the broker
    const broker = await storage.getBroker(brokerId);
    if (!broker) {
      console.log(`[Referral] Broker ${brokerId} not found`);
      res.clearCookie("pingpoint_ref", { path: "/" });
      return;
    }

    // Create the referral with REGISTERED status
    await storage.createReferral({
      referrerId: referrer.id,
      referredId: brokerId,
      referredEmail: broker.email,
      referrerCode: refCode,
      status: "REGISTERED",
    });

    console.log(`[Referral] Created referral: referrer=${referrer.email}, referred=${broker.email}`);

    // Check if broker is already PRO and grant rewards immediately
    const summary = await getBillingSummary(brokerId);
    if (summary.plan === "PRO") {
      await grantReferralRewardsIfEligible(brokerId);
      console.log(`[Referral] Broker is already PRO, granted rewards immediately`);
    }

    // Clear the cookie
    res.clearCookie("pingpoint_ref", { path: "/" });
  } catch (error: any) {
    console.error(`[Referral] Error applying referral from cookie:`, error.message);
    // Don't throw - referral application should not break login
  }
}

function getBaseUrl(req?: Request): string {
  // Priority: explicit env var > request headers > fallback
  if (process.env.PINGPOINT_PUBLIC_URL) {
    return process.env.PINGPOINT_PUBLIC_URL.replace(/\/$/, ''); // Remove trailing slash
  }
  
  // Try to infer from request headers
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) {
      return `${proto}://${host}`;
    }
  }
  
  // Fallback to localhost for development
  console.warn("[PingPoint] PINGPOINT_PUBLIC_URL not set, using localhost fallback");
  return 'http://localhost:5000';
}

// Wrapper for broker verification email using real provider
async function sendVerificationEmail(email: string, url: string, brokerName?: string): Promise<boolean> {
  return await sendBrokerVerificationEmail(email, url, brokerName);
}

// Wrapper for driver SMS (TODO: integrate Twilio)
async function sendDriverSMS(phone: string, url: string): Promise<void> {
  await sendDriverAppLink(phone, url);
}

export function registerHealthRoutes(app: Express) {
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Email diagnostics endpoint (does not expose secrets)
  app.get("/api/email/diagnostics", (_req: Request, res: Response) => {
    const mailFrom = process.env.MAIL_FROM;
    res.json({
      mailFrom: mailFrom ? "(set)" : "(missing)",
      mailFromValue: mailFrom || null,
      hasResendKey: !!process.env.RESEND_API_KEY,
      isProduction: process.env.NODE_ENV === "production",
    });
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============================================
  // DEBUG ENDPOINTS
  // ============================================
  
  // GET /api/debug/session - Verify session is working
  app.get("/api/debug/session", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      
      const plan = await getBillingSummary(broker.id);
      
      return res.json({
        ok: true,
        brokerId: broker.id,
        email: broker.email,
        plan: plan.plan,
      });
    } catch (error) {
      console.error("Error in GET /api/debug/session:", error);
      return res.status(500).json({ ok: false, error: "Internal server error" });
    }
  });

  // Broker endpoints

  // POST /api/brokers/ensure - Find or create broker
  app.post("/api/brokers/ensure", async (req: Request, res: Response) => {
    try {
      const { email, name, referralCode } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const emailNormalized = email.trim().toLowerCase();
      const brokerName = (name || "Broker").trim();

      let broker = await storage.getBrokerByEmail(emailNormalized);
      let isNewBroker = false;
      
      if (!broker) {
        broker = await storage.createBroker({
          email: emailNormalized,
          name: brokerName,
        });
        isNewBroker = true;
        
        // Only create referral relationship for NEW brokers
        if (referralCode) {
          try {
            const referrer = await storage.getBrokerByReferralCode(referralCode.toUpperCase());
            if (referrer && referrer.id !== broker.id) {
              await storage.createReferral({
                referrerId: referrer.id,
                referredId: broker.id,
                referredEmail: emailNormalized,
                referrerCode: referralCode.toUpperCase(),
                status: "REGISTERED",
              });
              console.log(`[Referral] Created referral for new broker: referrer=${referrer.email}, referred=${emailNormalized}`);
            }
          } catch (refErr: any) {
            console.error(`[Referral] Error creating referral:`, refErr.message);
          }
        }
      }

      return res.json({
        id: broker.id,
        email: broker.email,
        name: broker.name,
        emailVerified: broker.emailVerified,
        createdAt: broker.createdAt,
        updatedAt: broker.updatedAt,
        isNewBroker,
      });
    } catch (error) {
      console.error("Error in /api/brokers/ensure:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/brokers/send-verification (rate limited: 5 per minute)
  app.post("/api/brokers/send-verification", strictRateLimit(5, 60000), async (req: Request, res: Response) => {
    try {
      const { brokerId } = req.body;

      if (!brokerId) {
        return res.status(400).json({ error: "brokerId is required" });
      }

      const broker = await storage.getBroker(brokerId);
      if (!broker) {
        return res.status(404).json({ error: "Broker not found" });
      }

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 2); // Expires in 2 days

      await storage.createVerificationToken(broker.id, token, expiresAt);

      const origin = getBaseUrl(req);
      // Point to the SPA verification page, not the API endpoint
      const verificationUrl = `${origin}/verify?token=${token}`;
      console.log(`[PingPoint] Sending verification email to ${broker.email} with URL: ${verificationUrl}`);

      const sent = await sendVerificationEmail(broker.email, verificationUrl, broker.name);

      if (!sent) {
        return res.status(502).json({
          ok: false,
          error: "EMAIL_SEND_FAILED",
          message: "Verification email could not be sent. Check RESEND_API_KEY and MAIL_FROM (PingPoint <info@suverse.io>) and ensure the key belongs to the Resend account where suverse.io is verified."
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("Error in /api/brokers/send-verification:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/brokers/verify - Called by SPA to verify token (rate limited: 10 per minute)
  app.post("/api/brokers/verify", strictRateLimit(10, 60000), async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      console.log(`[Verify] POST /api/brokers/verify called with token: ${token?.substring(0, 16)}...`);

      if (!token || typeof token !== 'string') {
        console.log("[Verify] Invalid token format");
        return res.status(400).json({ error: "Invalid token" });
      }

      const verificationToken = await storage.getVerificationToken(token);

      if (!verificationToken) {
        console.log("[Verify] Token not found in database");
        return res.status(400).json({ error: "Token is invalid or expired" });
      }

      if (verificationToken.used) {
        console.log("[Verify] Token already used");
        return res.status(400).json({ error: "Token is invalid or expired" });
      }

      if (verificationToken.expiresAt < new Date()) {
        console.log("[Verify] Token expired at:", verificationToken.expiresAt);
        return res.status(400).json({ error: "Token is invalid or expired" });
      }

      console.log(`[Verify] Token valid for brokerId: ${verificationToken.brokerId}`);

      await storage.markTokenUsed(verificationToken.id);
      await storage.updateBroker(verificationToken.brokerId, { emailVerified: true });

      createBrokerSession(verificationToken.brokerId, res);
      
      // Mark this device as trusted
      await getOrCreateTrustedDevice(req, res, verificationToken.brokerId);
      console.log(`[Verify] Session and trusted device created for broker ${verificationToken.brokerId}`);
      
      // Apply referral from cookie if present
      await applyReferralFromCookie(req, res, verificationToken.brokerId);
      
      return res.json({ ok: true });
    } catch (error) {
      console.error("Error in /api/brokers/verify:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/brokers/verify?token=... - Fallback for direct browser hits
  app.get("/api/brokers/verify", async (req: Request, res: Response) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.redirect('/verify?error=invalid');
      }

      const verificationToken = await storage.getVerificationToken(token);

      if (!verificationToken || verificationToken.used || verificationToken.expiresAt < new Date()) {
        return res.redirect('/verify?error=expired');
      }

      await storage.markTokenUsed(verificationToken.id);
      await storage.updateBroker(verificationToken.brokerId, { emailVerified: true });

      createBrokerSession(verificationToken.brokerId, res);
      
      // Mark this device as trusted
      await getOrCreateTrustedDevice(req, res, verificationToken.brokerId);
      
      // Apply referral from cookie if present
      await applyReferralFromCookie(req, res, verificationToken.brokerId);
      
      return res.redirect('/app/loads');
    } catch (error) {
      console.error("Error in /api/brokers/verify:", error);
      return res.redirect('/verify?error=server');
    }
  });

  // POST /api/brokers/logout
  app.post("/api/brokers/logout", async (req: Request, res: Response) => {
    try {
      clearBrokerSession(res);
      return res.json({ ok: true });
    } catch (error) {
      console.error("Error in /api/brokers/logout:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/brokers/login - Trusted device login flow
  app.post("/api/brokers/login", strictRateLimit(10, 60000), async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      // Validate email
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({
          code: "INVALID_EMAIL",
          message: "Please enter a valid email address.",
        });
      }
      
      const emailNormalized = email.trim().toLowerCase();
      const broker = await storage.getBrokerByEmail(emailNormalized);
      
      // Broker not found
      if (!broker) {
        return res.status(404).json({
          code: "ACCOUNT_NOT_FOUND",
          message: "We couldn't find a broker account for this email.",
        });
      }
      
      // Broker exists but email not verified
      if (!broker.emailVerified) {
        return res.status(403).json({
          code: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email using the link we sent you.",
        });
      }
      
      // Check if this is a trusted device
      const trustedDevice = await getTrustedDevice(req, broker.id);
      
      if (trustedDevice) {
        // Trusted device - log in immediately
        await storage.updateBrokerDeviceLastUsed(trustedDevice.id);
        createBrokerSession(broker.id, res);
        console.log(`[Login] Trusted device login for broker ${broker.email}`);
        
        // Apply referral from cookie if present
        await applyReferralFromCookie(req, res, broker.id);
        
        return res.json({
          code: "LOGIN_SUCCESS",
          message: "Logged in successfully.",
          redirect: "/app/loads",
        });
      }
      
      // Not a trusted device - send magic link
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 2);
      
      await storage.createVerificationToken(broker.id, token, expiresAt);
      
      const origin = getBaseUrl(req);
      const verificationUrl = `${origin}/verify?token=${token}`;
      console.log(`[Login] New device login attempt for ${broker.email}, sending magic link`);
      
      await sendVerificationEmail(broker.email, verificationUrl, broker.name);
      
      return res.json({
        code: "MAGIC_LINK_SENT",
        message: "We sent a login link to your email to confirm this device.",
      });
    } catch (error) {
      console.error("Error in /api/brokers/login:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/brokers/me
  app.get("/api/brokers/me", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      return res.json({
        id: broker.id,
        email: broker.email,
        name: broker.name,
        emailVerified: broker.emailVerified,
      });
    } catch (error) {
      console.error("Error in /api/brokers/me:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/broker/profile - Get broker profile
  app.get("/api/broker/profile", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerWithAdminFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      return res.json({
        id: broker.id,
        name: broker.name,
        email: broker.email,
        phone: broker.phone || "",
        timezone: broker.timezone || "Central (CT)",
        emailVerified: broker.emailVerified,
        isAdmin: broker.isAdmin,
      });
    } catch (error) {
      console.error("Error in GET /api/broker/profile:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/broker/profile - Update broker profile
  app.put("/api/broker/profile", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { name, phone, timezone, email } = req.body;
      
      const updates: {
        name?: string;
        phone?: string | null;
        timezone?: string;
        email?: string;
        emailVerified?: boolean;
      } = {
        name: name || broker.name,
        phone: phone || null,
        timezone: timezone || broker.timezone,
      };

      // Handle email change with re-verification
      let emailChanged = false;
      if (email && email.trim().toLowerCase() !== broker.email) {
        const newEmail = email.trim().toLowerCase();
        
        // Check if email is already taken by another broker
        const existingBroker = await storage.getBrokerByEmail(newEmail);
        if (existingBroker && existingBroker.id !== broker.id) {
          return res.status(400).json({ error: "Email is already in use" });
        }
        
        updates.email = newEmail;
        updates.emailVerified = false;
        emailChanged = true;
      }

      // For email changes, send verification BEFORE updating database (atomic)
      if (emailChanged) {
        try {
          const origin = getBaseUrl(req);
          const verifyToken = randomBytes(32).toString('hex');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 2);
          
          const verificationUrl = `${origin}/verify?token=${verifyToken}`;
          const newEmail = updates.email as string;
          
          console.log(`[PingPoint] Attempting email change. Sending verification to ${newEmail}`);
          await sendVerificationEmail(newEmail, verificationUrl, broker.name);
          
          // Email sent successfully - now update database
          const updatedBroker = await storage.updateBroker(broker.id, updates);
          await storage.createVerificationToken(updatedBroker!.id, verifyToken, expiresAt);
          
          return res.json({
            id: updatedBroker?.id,
            name: updatedBroker?.name,
            email: updatedBroker?.email,
            phone: updatedBroker?.phone || "",
            timezone: updatedBroker?.timezone || "Central (CT)",
            emailVerified: updatedBroker?.emailVerified,
            emailChanged: true,
          });
        } catch (emailError) {
          console.error("Failed to send verification email:", emailError);
          return res.status(500).json({
            error: "Could not send verification email. Email was not changed.",
            code: "VERIFICATION_EMAIL_FAILED",
          });
        }
      }

      // Non-email updates
      const updatedBroker = await storage.updateBroker(broker.id, updates);

      return res.json({
        id: updatedBroker?.id,
        name: updatedBroker?.name,
        email: updatedBroker?.email,
        phone: updatedBroker?.phone || "",
        timezone: updatedBroker?.timezone || "Central (CT)",
        emailVerified: updatedBroker?.emailVerified,
        emailChanged: false,
      });
    } catch (error) {
      console.error("Error in PUT /api/broker/profile:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/broker/hints - Get field hints for typeahead
  app.get("/api/broker/hints", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { fieldKey, q, limit } = req.query;

      if (!fieldKey || typeof fieldKey !== 'string') {
        return res.status(400).json({ error: "fieldKey is required" });
      }

      const hints = await storage.getFieldHints(
        broker.id,
        fieldKey,
        typeof q === 'string' ? q : undefined,
        typeof limit === 'string' ? parseInt(limit, 10) : 10
      );

      return res.json(hints.map(h => ({ value: h.value, usageCount: h.usageCount })));
    } catch (error) {
      console.error("Error in GET /api/broker/hints:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Load endpoints

  // POST /api/loads - Create new load
  // First-time brokers can create their first load; verification email is sent.
  // Subsequent loads require email verification.
  app.post("/api/loads", async (req: Request, res: Response) => {
    let broker: any = null;
    let allowanceResult: { allowed: boolean; usedCredit?: boolean } | null = null;
    
    try {
      const { brokerEmail, brokerName, brokerPhone, timezone } = req.body;
      
      // Validate required fields
      if (!brokerEmail || !brokerEmail.includes('@')) {
        return res.status(400).json({ 
          error: "A valid broker email is required.",
          code: "BROKER_EMAIL_REQUIRED"
        });
      }
      
      // Get broker from session or lookup/create by email
      broker = await getBrokerFromRequest(req);
      let needsVerificationEmail = false;
      
      if (!broker) {
        const emailNormalized = brokerEmail.trim().toLowerCase();
        broker = await storage.getBrokerByEmail(emailNormalized) || null;
        
        if (!broker) {
          // Create new broker
          broker = await storage.createBroker({
            email: emailNormalized,
            name: brokerName || "Broker",
            phone: brokerPhone || null,
            timezone: timezone || "Central (CT)",
          });
          needsVerificationEmail = true;
        } else if (!broker.emailVerified) {
          // Existing unverified broker - check if they have any loads
          const existingLoads = await storage.getLoadsByBroker(broker.id);
          if (existingLoads.length > 0) {
            // Has loads but unverified - block with verification required
            return res.status(403).json({
              error: "Please verify your email before creating more loads. Check your inbox for the verification link.",
              code: "EMAIL_NOT_VERIFIED",
              email: broker.email,
              brokerId: broker.id,
            });
          }
          // No loads yet - allow first load creation, will send verification
          needsVerificationEmail = true;
        }
        
        // Set session cookie
        createBrokerSession(broker.id, res);
      } else {
        // Has session - check verification for subsequent loads
        if (!broker.emailVerified) {
          const existingLoads = await storage.getLoadsByBroker(broker.id);
          if (existingLoads.length > 0) {
            return res.status(403).json({
              error: "Please verify your email before creating more loads.",
              code: "EMAIL_NOT_VERIFIED",
              email: broker.email,
              brokerId: broker.id,
            });
          }
          needsVerificationEmail = true;
        }
        
        // Update profile with missing fields
        const updates: any = {};
        if (!broker.phone && brokerPhone) updates.phone = brokerPhone;
        if (!broker.timezone && timezone) updates.timezone = timezone;
        
        if (Object.keys(updates).length > 0) {
          broker = await storage.updateBroker(broker.id, updates) || broker;
        }
      }

      // Extract fields that are for broker/driver, not for the load itself
      const { 
        driverPhone, 
        stops: stopsData, 
        brokerEmail: _be, 
        brokerName: _bn, 
        brokerPhone: _bp, 
        timezone: _tz,
        customerReference,
        internalReference,
        ...loadData 
      } = req.body;

      // Handle customerReference -> customerRef mapping
      if (customerReference && !loadData.customerRef) {
        loadData.customerRef = customerReference;
      }

      // Validate and find/create driver
      let driver = null;
      if (driverPhone) {
        const phoneNormalized = driverPhone.trim();
        driver = await storage.getDriverByPhone(phoneNormalized);
        if (!driver) {
          driver = await storage.createDriver({ phone: phoneNormalized });
        }
      }

      // Check billing limits before creating load
      allowanceResult = await checkAndConsumeLoadAllowance(broker.id);
      if (!allowanceResult.allowed) {
        return res.status(402).json({
          error: "You've reached your monthly limit (3 loads). Buy extra loads or upgrade.",
          code: "LOAD_LIMIT_REACHED",
          includedLoads: FREE_INCLUDED_LOADS,
        });
      }

      // Generate tokens and load number
      const loadNumber = generateLoadNumber();
      const trackingToken = generateToken('trk');
      const driverToken = generateToken('drv');

      // Create load
      const load = await storage.createLoad({
        brokerId: broker.id,
        driverId: driver?.id || null,
        loadNumber,
        trackingToken,
        driverToken,
        shipperName: loadData.shipperName,
        carrierName: loadData.carrierName,
        equipmentType: loadData.equipmentType,
        customerRef: loadData.customerRef || null,
        rateAmount: loadData.rateAmount?.toString() || "0",
        status: "PLANNED",
        pickupEta: null,
        deliveryEta: null,
        billingMonth: null,
        isBillable: true,
      });

      // Create stops
      if (stopsData && Array.isArray(stopsData)) {
        const stopsToCreate = stopsData.map((stop: any, index: number) => ({
          loadId: load.id,
          sequence: index + 1,
          type: stop.type,
          name: stop.name,
          fullAddress: stop.addressLine1 || stop.fullAddress || "",
          city: stop.city,
          state: stop.state,
          lat: null,
          lng: null,
          windowFrom: stop.windowStart ? new Date(stop.windowStart) : null,
          windowTo: stop.windowEnd ? new Date(stop.windowEnd) : null,
          arrivedAt: null,
          departedAt: null,
        }));

        await storage.createStops(stopsToCreate);
      }

      // Log activity (non-blocking)
      storage.createActivityLog({
        entityType: "load",
        entityId: load.id,
        action: "load_created",
        actorType: "broker",
        actorId: broker!.id,
        metadata: JSON.stringify({ loadNumber: load.loadNumber, driverId: driver?.id || null }),
      }).catch(err => console.error("Error logging activity:", err));

      // Ingest field hints for typeahead suggestions (non-blocking)
      const hintsToIngest = [
        { fieldKey: "shipperName", value: loadData.shipperName },
        { fieldKey: "carrierName", value: loadData.carrierName },
        { fieldKey: "equipmentType", value: loadData.equipmentType },
        { fieldKey: "customerRef", value: loadData.customerRef },
      ];

      // Add stop-related hints
      if (stopsData && Array.isArray(stopsData)) {
        for (const stop of stopsData) {
          if (stop.type === 'PICKUP') {
            if (stop.name) hintsToIngest.push({ fieldKey: "pickupName", value: stop.name });
            if (stop.city) hintsToIngest.push({ fieldKey: "pickupCity", value: stop.city });
            if (stop.state) hintsToIngest.push({ fieldKey: "pickupState", value: stop.state });
          } else if (stop.type === 'DELIVERY') {
            if (stop.name) hintsToIngest.push({ fieldKey: "deliveryName", value: stop.name });
            if (stop.city) hintsToIngest.push({ fieldKey: "deliveryCity", value: stop.city });
            if (stop.state) hintsToIngest.push({ fieldKey: "deliveryState", value: stop.state });
          }
        }
      }

      // Ingest hints in background (don't await to avoid blocking response)
      Promise.all(
        hintsToIngest
          .filter(h => h.value && typeof h.value === 'string' && h.value.trim())
          .map(h => storage.upsertFieldHint(broker!.id, h.fieldKey, h.value))
      ).catch(err => console.error("Error ingesting hints:", err));

      // Send driver notification
      if (driver) {
        const origin = getBaseUrl(req);
        const driverAppUrl = `${origin}/driver/${driverToken}`;
        await sendDriverSMS(driver.phone, driverAppUrl);
      }

      // Send verification email for new/unverified broker
      if (needsVerificationEmail && broker && !broker.emailVerified) {
        try {
          const origin = getBaseUrl(req);
          const verifyToken = randomBytes(32).toString('hex');
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 2);
          await storage.createVerificationToken(broker.id, verifyToken, expiresAt);
          
          const verificationUrl = `${origin}/verify?token=${verifyToken}`;
          console.log(`[PingPoint] Sending verification email to ${broker.email}`);
          await sendVerificationEmail(broker.email, verificationUrl, broker.name);
        } catch (emailErr) {
          console.error("Failed to send verification email:", emailErr);
          // Don't fail the load creation if email fails - load was already created
        }
      }

      // Track usage (non-blocking) - always track even if not enforcing
      incrementLoadsCreated(broker.id).catch(err => 
        console.error("Error tracking usage:", err)
      );

      // Emit webhook event (non-blocking)
      emitLoadEvent({
        brokerId: broker.id,
        loadId: load.id,
        eventType: "pingpoint.load.created",
      }).catch(err => console.error("Error emitting webhook:", err));

      return res.status(201).json({
        id: load.id,
        loadNumber: load.loadNumber,
        status: load.status,
        trackingToken: load.trackingToken,
        driverToken: load.driverToken,
      });
    } catch (error) {
      console.error("Error in /api/loads:", error);
      // Rollback billing consumption if load creation failed after billing check
      if (allowanceResult?.allowed) {
        await rollbackLoadAllowance(broker!.id, allowanceResult.usedCredit || false).catch(err => 
          console.error("Error rolling back billing:", err)
        );
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/loads - List loads for current broker (with pagination and filters)
  app.get("/api/loads", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const offset = (page - 1) * limit;

      const filterOptions = {
        limit,
        offset,
        status: req.query.status as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        shipper: req.query.shipper as string | undefined,
        receiver: req.query.receiver as string | undefined,
        loadNumber: req.query.loadNumber as string | undefined,
        minRate: req.query.minRate ? parseFloat(req.query.minRate as string) : undefined,
        maxRate: req.query.maxRate ? parseFloat(req.query.maxRate as string) : undefined,
        phone: req.query.phone as string | undefined,
        address: req.query.address as string | undefined,
        email: req.query.email as string | undefined,
      };

      const { loads: allLoads, total } = await storage.getLoadsByBrokerPaginated(
        broker.id, 
        filterOptions
      );

      const enrichedLoads = await Promise.all(
        allLoads.map(async (load) => {
          const loadStops = await storage.getStopsByLoad(load.id);
          const pickupStop = loadStops.find(s => s.type === 'PICKUP');
          const deliveryStop = loadStops.find(s => s.type === 'DELIVERY');
          const hasRateConfirmation = await storage.hasRateConfirmation(load.id);

          return {
            id: load.id,
            loadNumber: load.loadNumber,
            shipperName: load.shipperName,
            carrierName: load.carrierName,
            status: load.status,
            rateAmount: load.rateAmount,
            originCity: pickupStop?.city || "",
            originState: pickupStop?.state || "",
            destinationCity: deliveryStop?.city || "",
            destinationState: deliveryStop?.state || "",
            createdAt: load.createdAt,
            hasRateConfirmation,
          };
        })
      );

      return res.json({
        items: enrichedLoads,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Error in /api/loads:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/drivers - List drivers with pagination and filters
  app.get("/api/drivers", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { search, favorite, blocked, page = "1", limit = "20" } = req.query;

      const result = await storage.getDriversByBrokerPaginated(broker.id, {
        search: search as string | undefined,
        favorite: favorite === "true" ? true : favorite === "false" ? false : undefined,
        blocked: blocked === "true" ? true : blocked === "false" ? false : undefined,
        page: parseInt(page as string, 10) || 1,
        limit: parseInt(limit as string, 10) || 20,
      });

      return res.json({
        items: result.items.map(d => ({
          id: d.id,
          name: d.name || null,
          phone: d.phone,
          email: d.email || null,
          truckNumber: d.truckNumber || null,
          equipmentType: d.equipmentType || null,
          tags: d.tags || [],
          isFavorite: d.isFavorite,
          isBlocked: d.isBlocked,
          statsTotalLoads: d.statsTotalLoads,
          statsOnTimeLoads: d.statsOnTimeLoads,
          statsLateLoads: d.statsLateLoads,
          onTimePercent: d.statsTotalLoads > 0 ? Math.round((d.statsOnTimeLoads / d.statsTotalLoads) * 100) : null,
          createdAt: d.createdAt.toISOString(),
        })),
        page: parseInt(page as string, 10) || 1,
        limit: parseInt(limit as string, 10) || 20,
        total: result.total,
      });
    } catch (error) {
      console.error("Error in GET /api/drivers:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/drivers - Create a new driver
  app.post("/api/drivers", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { name, phone, email, truckNumber, equipmentType, tags } = req.body;

      if (!phone) {
        return res.status(400).json({ error: "Phone is required" });
      }

      const driver = await storage.createDriver({
        brokerId: broker.id,
        name: name || null,
        phone,
        email: email || null,
        truckNumber: truckNumber || null,
        equipmentType: equipmentType || null,
        tags: tags || [],
      });

      return res.json({
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        truckNumber: driver.truckNumber,
        equipmentType: driver.equipmentType,
        tags: driver.tags || [],
        isFavorite: driver.isFavorite,
        isBlocked: driver.isBlocked,
        statsTotalLoads: driver.statsTotalLoads,
        statsOnTimeLoads: driver.statsOnTimeLoads,
        statsLateLoads: driver.statsLateLoads,
        createdAt: driver.createdAt.toISOString(),
      });
    } catch (error) {
      console.error("Error in POST /api/drivers:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/drivers/:id - Update a driver
  app.put("/api/drivers/:id", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;
      const existingDriver = await storage.getDriver(id);
      
      if (!existingDriver || existingDriver.brokerId !== broker.id) {
        return res.status(404).json({ error: "Driver not found" });
      }

      const { name, phone, email, truckNumber, equipmentType, tags, isFavorite, isBlocked } = req.body;

      const updated = await storage.updateDriver(id, {
        name: name !== undefined ? name : existingDriver.name,
        phone: phone !== undefined ? phone : existingDriver.phone,
        email: email !== undefined ? email : existingDriver.email,
        truckNumber: truckNumber !== undefined ? truckNumber : existingDriver.truckNumber,
        equipmentType: equipmentType !== undefined ? equipmentType : existingDriver.equipmentType,
        tags: tags !== undefined ? tags : existingDriver.tags,
        isFavorite: isFavorite !== undefined ? isFavorite : existingDriver.isFavorite,
        isBlocked: isBlocked !== undefined ? isBlocked : existingDriver.isBlocked,
      });

      if (!updated) {
        return res.status(500).json({ error: "Failed to update driver" });
      }

      return res.json({
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        truckNumber: updated.truckNumber,
        equipmentType: updated.equipmentType,
        tags: updated.tags || [],
        isFavorite: updated.isFavorite,
        isBlocked: updated.isBlocked,
        statsTotalLoads: updated.statsTotalLoads,
        statsOnTimeLoads: updated.statsOnTimeLoads,
        statsLateLoads: updated.statsLateLoads,
        createdAt: updated.createdAt.toISOString(),
      });
    } catch (error) {
      console.error("Error in PUT /api/drivers/:id:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/loads/recommend-drivers - Get recommended drivers for a new load
  app.get("/api/loads/recommend-drivers", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { pickupState, pickupCity, deliveryState, deliveryCity, limit = "3" } = req.query;

      const drivers = await storage.getRecommendedDrivers(broker.id, {
        pickupState: pickupState as string | undefined,
        pickupCity: pickupCity as string | undefined,
        deliveryState: deliveryState as string | undefined,
        deliveryCity: deliveryCity as string | undefined,
        limit: parseInt(limit as string, 10) || 3,
      });

      return res.json({
        drivers: drivers.map(d => ({
          id: d.id,
          name: d.name || d.phone,
          phone: d.phone,
          equipmentType: d.equipmentType,
          statsTotalLoads: d.statsTotalLoads,
          onTimePercent: d.statsTotalLoads > 0 ? Math.round((d.statsOnTimeLoads / d.statsTotalLoads) * 100) : null,
        })),
      });
    } catch (error) {
      console.error("Error in GET /api/loads/recommend-drivers:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/loads/:id - Get single load details
  app.get("/api/loads/:id", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const load = await storage.getLoad(req.params.id);
      if (!load || load.brokerId !== broker.id) {
        return res.status(404).json({ error: "Load not found" });
      }

      const loadStops = await storage.getStopsByLoad(load.id);
      const trackingPingsList = await storage.getTrackingPingsByLoad(load.id);
      const rateConfirmationFile = await storage.getLatestRateConfirmationFile(load.id);

      return res.json({
        ...load,
        stops: loadStops,
        trackingPings: trackingPingsList,
        rateConfirmationFile: rateConfirmationFile ? {
          id: rateConfirmationFile.id,
          url: rateConfirmationFile.fileUrl,
          originalName: rateConfirmationFile.originalName,
        } : null,
      });
    } catch (error) {
      console.error("Error in /api/loads/:id:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Public tracking endpoint
  // GET /api/track/:token
  app.get("/api/track/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const load = await storage.getLoadByToken(token, 'tracking');

      if (!load) {
        return res.status(404).json({ error: "Load not found" });
      }

      const loadStops = await storage.getStopsByLoad(load.id);
      const trackingPingsList = await storage.getTrackingPingsByLoad(load.id);
      const latestPing = trackingPingsList[0]; // First is most recent due to desc order
      const geofenceDebug = await getGeofenceDebugInfo(load.id);

      return res.json({
        loadNumber: load.loadNumber,
        status: load.status,
        shipperName: load.shipperName,
        stops: loadStops,
        lastLocation: latestPing ? {
          lat: latestPing.lat,
          lng: latestPing.lng,
          timestamp: latestPing.createdAt,
        } : null,
        geofenceDebug,
      });
    } catch (error) {
      console.error("Error in /api/track/:token:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Driver app endpoints
  // GET /api/driver/:token
  app.get("/api/driver/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const load = await storage.getLoadByToken(token, 'driver');

      if (!load) {
        return res.status(404).json({ error: "Load not found" });
      }

      const loadStops = await storage.getStopsByLoad(load.id);
      const rewardBalance = await getRewardBalance(load.driverId, token);

      return res.json({
        id: load.id,
        loadNumber: load.loadNumber,
        customerRef: load.customerRef,
        status: load.status,
        stops: loadStops,
        rewardBalance,
      });
    } catch (error) {
      console.error("Error in /api/driver/:token:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/driver/:token/rewards - Get driver reward balance
  app.get("/api/driver/:token/rewards", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const load = await storage.getLoadByToken(token, 'driver');

      if (!load) {
        return res.status(404).json({ error: "Load not found" });
      }

      const balance = await getRewardBalance(load.driverId, token);

      return res.json({
        balance,
        driverId: load.driverId || null,
      });
    } catch (error) {
      console.error("Error in /api/driver/:token/rewards:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/driver/:token/ping - Submit location ping (rate limited: 60 per minute, 1 per 30s per load)
  app.post("/api/driver/:token/ping", strictRateLimit(60, 60000), async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { lat, lng, accuracy, speed, heading } = req.body;
      const ua = req.headers['user-agent'] || 'unknown';
      
      console.log(`[TrackingPing] recv token=${token ? token.substring(0, 8) + '...' : 'missing'} lat=${lat} lng=${lng} ua=${ua.substring(0, 50)}`);

      // Validate coordinates are finite numbers within valid ranges
      if (typeof lat !== 'number' || typeof lng !== 'number' || 
          !Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.log(`[TrackingPing] REJECTED reason=invalid_coords lat=${lat} lng=${lng}`);
        return res.status(400).json({ ok: false, error: "lat and lng are required numbers" });
      }
      
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        console.log(`[TrackingPing] REJECTED reason=coords_out_of_range lat=${lat} lng=${lng}`);
        return res.status(400).json({ ok: false, error: "invalid_coords" });
      }

      const load = await storage.getLoadByToken(token, 'driver');
      if (!load || !load.driverId) {
        console.log(`[TrackingPing] rejected reason=load_not_found token=${token}`);
        return res.status(404).json({ error: "Load not found" });
      }

      // Reject pings if tracking has ended (load delivered and 60s grace period passed)
      if (load.trackingEndedAt && new Date() >= new Date(load.trackingEndedAt)) {
        console.log(`[TrackingPing] rejected load=${load.loadNumber} driver=${load.driverId} reason=tracking_ended`);
        return res.status(409).json({ error: "Tracking ended", trackingEnded: true });
      }

      // Per-load rate limiting: max 1 ping per 30 seconds
      const rateKey = `load:${load.id}:${load.driverId}`;
      if (!shouldAcceptPing(rateKey)) {
        console.info(`[ping-rate-limit] Dropping ping (too frequent, interval <${MIN_PING_INTERVAL_MS}ms) for ${rateKey}`);
        return res.json({ ok: true });
      }

      // Check if this is the first ping for this load (for first location share reward)
      const hasPriorPings = await storage.hasTrackingPingsForLoad(load.id);
      const isFirstPing = !hasPriorPings;

      const ping = await storage.createTrackingPing({
        loadId: load.id,
        driverId: load.driverId,
        lat: lat.toString(),
        lng: lng.toString(),
        accuracy: accuracy != null ? accuracy.toString() : null,
        speed: speed != null ? speed.toString() : null,
        heading: heading != null ? heading.toString() : null,
        source: "DRIVER_APP",
      });

      console.log(`[TrackingPing] stored load=${load.loadNumber} driver=${load.driverId} lat=${lat} lng=${lng} acc=${accuracy ?? 'unknown'}m`);

      // Award FIRST_LOCATION_SHARE bonus for first ping
      let rewardResult: { pointsAwarded: number; newBalance: number; eventType: RewardEventType } | null = null;
      if (isFirstPing) {
        try {
          rewardResult = await awardPointsForEvent({
            loadId: load.id,
            driverId: load.driverId,
            driverToken: token,
            eventType: 'FIRST_LOCATION_SHARE',
          });
          console.log(`[TrackingPing] awarded FIRST_LOCATION_SHARE for load=${load.loadNumber}`);
        } catch (err) {
          console.error("Error awarding first location share:", err);
        }
      }

      // Evaluate geofences for auto-arrive/depart (non-blocking)
      const parsedAccuracy = accuracy != null ? parseFloat(accuracy.toString()) : null;
      evaluateGeofencesForActiveLoad(load.driverId, load.id, parseFloat(lat.toString()), parseFloat(lng.toString()), parsedAccuracy)
        .catch(err => console.error("Error evaluating geofences:", err));

      return res.json({ 
        ok: true, 
        pingId: ping.id,
        reward: rewardResult || undefined,
      });
    } catch (error) {
      console.error("Error in /api/driver/:token/ping:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/driver/location - Alternative endpoint for location updates (matches spec, 1 per 30s per load)
  app.post("/api/driver/location", strictRateLimit(60, 60000), async (req: Request, res: Response) => {
    try {
      const { token, lat, lng, accuracy, speed, heading, timestamp } = req.body;
      const ua = req.headers['user-agent'] || 'unknown';
      
      console.log(`[TrackingPing] recv token=${token ? token.substring(0, 8) + '...' : 'missing'} lat=${lat} lng=${lng} ua=${ua.substring(0, 50)}`);

      if (!token || typeof token !== 'string') {
        console.log(`[TrackingPing] REJECTED reason=missing_token`);
        return res.status(400).json({ ok: false, error: "token is required" });
      }
      
      // Validate coordinates are finite numbers within valid ranges
      if (typeof lat !== 'number' || typeof lng !== 'number' || 
          !Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.log(`[TrackingPing] REJECTED reason=invalid_coords lat=${lat} lng=${lng}`);
        return res.status(400).json({ ok: false, error: "lat and lng are required numbers" });
      }
      
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        console.log(`[TrackingPing] REJECTED reason=coords_out_of_range lat=${lat} lng=${lng}`);
        return res.status(400).json({ ok: false, error: "invalid_coords" });
      }

      const load = await storage.getLoadByToken(token, 'driver');
      if (!load || !load.driverId) {
        console.log(`[TrackingPing] rejected reason=load_not_found token=${token}`);
        return res.status(404).json({ error: "Load not found" });
      }

      // Reject pings if tracking has ended (load delivered and 60s grace period passed)
      if (load.trackingEndedAt && new Date() >= new Date(load.trackingEndedAt)) {
        console.log(`[TrackingPing] rejected load=${load.loadNumber} driver=${load.driverId} reason=tracking_ended`);
        return res.status(409).json({ error: "Tracking ended", trackingEnded: true });
      }

      // Per-load rate limiting: max 1 ping per 30 seconds
      const rateKey = `load:${load.id}:${load.driverId}`;
      if (!shouldAcceptPing(rateKey)) {
        console.info(`[ping-rate-limit] Dropping ping (too frequent, interval <${MIN_PING_INTERVAL_MS}ms) for ${rateKey}`);
        return res.json({ ok: true });
      }

      const ping = await storage.createTrackingPing({
        loadId: load.id,
        driverId: load.driverId,
        lat: lat.toString(),
        lng: lng.toString(),
        accuracy: accuracy != null ? accuracy.toString() : null,
        speed: speed != null ? speed.toString() : null,
        heading: heading != null ? heading.toString() : null,
        source: "DRIVER_APP",
      });

      console.log(`[TrackingPing] stored load=${load.loadNumber} driver=${load.driverId} lat=${lat} lng=${lng} acc=${accuracy ?? 'unknown'}m`);

      // Evaluate geofences for auto-arrive/depart (non-blocking)
      const parsedAccuracy = accuracy != null ? parseFloat(accuracy.toString()) : null;
      evaluateGeofencesForActiveLoad(load.driverId, load.id, parseFloat(lat.toString()), parseFloat(lng.toString()), parsedAccuracy)
        .catch(err => console.error("Error evaluating geofences:", err));

      return res.json({ ok: true, pingId: ping.id });
    } catch (error) {
      console.error("Error in /api/driver/location:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/driver/:token/stop/:stopId - Update stop status
  app.patch("/api/driver/:token/stop/:stopId", async (req: Request, res: Response) => {
    try {
      const { token, stopId } = req.params;
      const { arrivedAt, departedAt } = req.body;

      const load = await storage.getLoadByToken(token, 'driver');
      if (!load) {
        return res.status(404).json({ error: "Load not found" });
      }

      // Get the stop to check its type
      const existingStop = await storage.getStopById(stopId);
      if (!existingStop) {
        return res.status(404).json({ error: "Stop not found" });
      }

      const updateData: any = {};
      if (arrivedAt) updateData.arrivedAt = new Date(arrivedAt);
      if (departedAt) updateData.departedAt = new Date(departedAt);

      const stop = await storage.updateStop(stopId, updateData);

      // Award points for manual status updates
      let reward: { pointsAwarded: number; newBalance: number; eventType: RewardEventType } | null = null;
      
      if (arrivedAt && !existingStop.arrivedAt) {
        const eventType: RewardEventType = existingStop.type === 'PICKUP' ? 'ARRIVE_PICKUP' : 'ARRIVE_DELIVERY';
        reward = await awardPointsForEvent({
          loadId: load.id,
          driverId: load.driverId,
          driverToken: token,
          eventType,
        });
      } else if (departedAt && !existingStop.departedAt) {
        const eventType: RewardEventType = existingStop.type === 'PICKUP' ? 'DEPART_PICKUP' : 'DEPART_DELIVERY';
        reward = await awardPointsForEvent({
          loadId: load.id,
          driverId: load.driverId,
          driverToken: token,
          eventType,
        });
      }

      // If this is a DELIVERY stop and we're setting departedAt, mark load as DELIVERED
      if (existingStop.type === 'DELIVERY' && departedAt && !existingStop.departedAt) {
        const now = new Date();
        const trackingEndTime = new Date(now.getTime() + 60000); // 60 seconds from now
        const previousStatus = load.status;
        
        await storage.updateLoad(load.id, {
          status: 'DELIVERED',
          deliveredAt: now,
          trackingEndedAt: trackingEndTime,
        });

        // Check if delivery was on time (within 15 minutes of expected window)
        const deliveryWindow = existingStop.windowTo;
        if (deliveryWindow) {
          const expectedTime = new Date(deliveryWindow);
          const graceMs = 15 * 60 * 1000; // 15 minutes grace period
          if (now.getTime() <= expectedTime.getTime() + graceMs) {
            awardPointsForEvent({
              loadId: load.id,
              driverId: load.driverId,
              driverToken: token,
              eventType: 'LOAD_ON_TIME',
            }).catch(err => console.error("Error awarding on-time bonus:", err));
          }
        }

        // Emit webhook events for status change and load completion
        emitLoadEvent({
          brokerId: load.brokerId,
          loadId: load.id,
          eventType: "pingpoint.status.changed",
          previousStatus,
        }).catch(err => console.error("Error emitting webhook:", err));

        emitLoadEvent({
          brokerId: load.brokerId,
          loadId: load.id,
          eventType: "pingpoint.load.completed",
          previousStatus,
        }).catch(err => console.error("Error emitting webhook:", err));

        notifyLoadStatusChange({
          loadId: load.id,
          newStatus: 'DELIVERED',
          previousStatus,
        }).catch(err => console.error("Error sending notification:", err));

        storage.resolveExceptions(load.brokerId, load.id)
          .catch(err => console.error("Error resolving exceptions:", err));

        return res.json({ 
          ok: true, 
          stop, 
          loadDelivered: true,
          trackingEndsAt: trackingEndTime.toISOString(),
          reward: reward || undefined,
        });
      }

      return res.json({ ok: true, stop, reward: reward || undefined });
    } catch (error) {
      console.error("Error in /api/driver/:token/stop/:stopId:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Rate confirmation file upload
  // Serve uploads directory
  // Billing endpoints

  // GET /api/broker/usage - Get broker usage summary (cycle tracking)
  app.get("/api/broker/usage", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const usage = await getUsageSummary(broker.id);
      return res.json(usage);
    } catch (error) {
      console.error("Error in GET /api/broker/usage:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/billing/summary - Get billing summary for current broker
  app.get("/api/billing/summary", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const summary = await getBillingSummary(broker.id);
      return res.json(summary);
    } catch (error) {
      console.error("Error in GET /api/billing/summary:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================
  // WEBHOOK INTEGRATION ENDPOINTS
  // =============================================

  // GET /api/integrations/webhook - Get webhook config
  app.get("/api/integrations/webhook", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const config = await getOrCreateWebhookConfigForUser(broker.id);
      return res.json({
        enabled: config.enabled,
        url: config.url,
      });
    } catch (error) {
      console.error("Error in GET /api/integrations/webhook:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/integrations/webhook - Update webhook config
  app.post("/api/integrations/webhook", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { enabled, url } = req.body;

      try {
        const config = await updateWebhookConfigForUser(broker.id, { enabled, url });
        return res.json({
          enabled: config.enabled,
          url: config.url,
        });
      } catch (validationErr: any) {
        return res.status(400).json({ error: validationErr.message });
      }
    } catch (error) {
      console.error("Error in POST /api/integrations/webhook:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================
  // PROMO & REFERRAL ENDPOINTS
  // =============================================

  // Referral reward configuration
  const REFERRAL_REFERRER_LOADS = 20;
  const REFERRAL_REFERRED_LOADS = 10;

  // POST /api/billing/promo/validate - Validate a promo code
  app.post("/api/billing/promo/validate", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ valid: false, message: "Promo code is required" });
      }

      const promotion = await storage.getPromotionByCode(code);
      if (!promotion) {
        return res.json({ valid: false, message: "Invalid promo code" });
      }

      const now = new Date();
      
      if (!promotion.active) {
        return res.json({ valid: false, message: "This promo code is no longer active" });
      }

      if (promotion.validFrom && now < new Date(promotion.validFrom)) {
        return res.json({ valid: false, message: "This promo code is not yet active" });
      }

      if (promotion.validTo && now > new Date(promotion.validTo)) {
        return res.json({ valid: false, message: "This promo code has expired" });
      }

      if (promotion.maxRedemptions && promotion.redemptionCount >= promotion.maxRedemptions) {
        return res.json({ valid: false, message: "This promo code has reached its usage limit" });
      }

      // Check per-user limit
      const userRedemptions = await storage.getPromotionRedemptionsByUser(broker.id, promotion.id);
      const completedRedemptions = userRedemptions.filter(r => r.status === "COMPLETED").length;
      if (promotion.perUserLimit && completedRedemptions >= promotion.perUserLimit) {
        return res.json({ valid: false, message: "You have already used this promo code" });
      }

      // Build benefit description
      const benefits: string[] = [];
      if (promotion.rewardLoads > 0) {
        benefits.push(`${promotion.rewardLoads} free loads`);
      }
      if (promotion.discountType === "PERCENT_FIRST_SUBSCRIPTION" && promotion.discountValue > 0) {
        benefits.push(`${promotion.discountValue}% off first month`);
      }
      if (promotion.discountType === "FIXED_FIRST_SUBSCRIPTION" && promotion.discountValue > 0) {
        benefits.push(`$${(promotion.discountValue / 100).toFixed(2)} off first month`);
      }

      return res.json({
        valid: true,
        code: promotion.code,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        rewardLoads: promotion.rewardLoads,
        description: promotion.description,
        message: benefits.length > 0 ? `Benefits: ${benefits.join(" + ")}` : "Code applied successfully",
      });
    } catch (error) {
      console.error("Error in POST /api/billing/promo/validate:", error);
      return res.status(500).json({ valid: false, message: "Error validating promo code" });
    }
  });

  // GET /api/broker/referral - Get broker's personal referral code and stats
  app.get("/api/broker/referral", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Generate referral code if not exists
      let referralCode = broker.referralCode;
      if (!referralCode) {
        // Generate a unique 8-character code
        const generateCode = () => {
          const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          let code = "";
          for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return code;
        };

        let attempts = 0;
        while (!referralCode && attempts < 10) {
          const candidate = generateCode();
          const existing = await storage.getBrokerByReferralCode(candidate);
          if (!existing) {
            await storage.updateBrokerReferralCode(broker.id, candidate);
            referralCode = candidate;
          }
          attempts++;
        }
      }

      const stats = await storage.getReferralStats(broker.id);
      const origin = process.env.PINGPOINT_PUBLIC_URL || "https://pingpoint.app";
      const referralLink = `${origin}/login?ref=${referralCode}`;

      // Check if this broker has applied someone else's referral code
      const appliedReferral = await storage.getReferralByReferredId(broker.id);

      return res.json({
        code: referralCode,
        link: referralLink,
        stats: {
          totalReferred: stats.totalReferred,
          proSubscribed: stats.proSubscribed,
          loadsEarned: stats.loadsEarned,
        },
        rewards: {
          referrerLoads: REFERRAL_REFERRER_LOADS,
          referredLoads: REFERRAL_REFERRED_LOADS,
        },
        hasAppliedReferral: !!appliedReferral,
      });
    } catch (error) {
      console.error("Error in GET /api/broker/referral:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/broker/referrals - Get list of referred users
  app.get("/api/broker/referrals", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const allReferrals = await storage.getReferrals();
      const myReferrals = allReferrals.filter(r => r.referrerId === broker.id);

      const enriched = await Promise.all(
        myReferrals.map(async (ref) => {
          const referred = ref.referredId ? await storage.getBroker(ref.referredId) : null;
          return {
            id: ref.id,
            referredEmail: ref.referredEmail ? maskEmail(ref.referredEmail) : null,
            referredName: referred?.name || null,
            status: ref.status,
            loadsEarned: ref.referrerLoadsGranted,
            createdAt: ref.createdAt,
          };
        })
      );

      return res.json({ referrals: enriched });
    } catch (error) {
      console.error("Error in GET /api/broker/referrals:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Helper function to mask email
  function maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!domain) return email;
    const masked = local.length > 2 
      ? local[0] + "*".repeat(Math.min(local.length - 2, 5)) + local[local.length - 1]
      : local[0] + "*";
    return `${masked}@${domain}`;
  }

  // POST /api/referrals/track - Set referral cookie when user visits with ?ref=CODE
  // Security: Always returns success to prevent referral code enumeration attacks
  // Actual validation is deferred to login time in applyReferralFromCookie
  app.post("/api/referrals/track", strictRateLimit(10, 60000), async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      
      if (!code || typeof code !== "string") {
        // Return success even for invalid input to prevent information leakage
        return res.json({ ok: true });
      }

      const normalizedCode = code.trim().toUpperCase();
      
      // Only set cookie if code looks valid (8 alphanumeric chars)
      // Don't validate against database to prevent enumeration attacks
      if (normalizedCode && /^[A-Z0-9]{6,10}$/.test(normalizedCode)) {
        res.cookie("pingpoint_ref", normalizedCode, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          path: "/",
        });
        console.log(`[Referral] Tracked referral code in cookie`);
      }

      // Always return success to prevent code enumeration
      return res.json({ ok: true });
    } catch (error) {
      console.error("Error in POST /api/referrals/track:", error);
      // Return success even on error to prevent information leakage
      return res.json({ ok: true });
    }
  });

  // ============================================
  // EXCEPTIONS API
  // ============================================

  // GET /api/loads/exceptions - Get unresolved exceptions for current broker
  app.get("/api/loads/exceptions", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const type = req.query.type as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const offset = (page - 1) * limit;

      const { exceptions, total } = await storage.getUnresolvedExceptions(broker.id, type, limit, offset);

      const enrichedExceptions = await Promise.all(
        exceptions.map(async (exc) => {
          const load = await storage.getLoad(exc.loadId);
          const stops = load ? await storage.getStopsByLoad(load.id) : [];
          const pickupStop = stops.find(s => s.type === 'PICKUP');
          const deliveryStop = stops.find(s => s.type === 'DELIVERY');
          const pings = load ? await storage.getTrackingPingsByLoad(load.id) : [];
          const lastPing = pings.length > 0 ? pings[pings.length - 1] : null;

          return {
            id: exc.id,
            loadId: exc.loadId,
            loadNumber: load?.loadNumber || 'Unknown',
            type: exc.type,
            detectedAt: exc.detectedAt.toISOString(),
            lastPingAt: lastPing?.createdAt?.toISOString() || null,
            status: load?.status || 'Unknown',
            shipperName: pickupStop?.name || load?.shipperName || null,
            receiverName: deliveryStop?.name || null,
            details: exc.details ? JSON.parse(exc.details) : null,
          };
        })
      );

      return res.json({
        exceptions: enrichedExceptions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Error in GET /api/loads/exceptions:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/loads/:id/exceptions/resolve - Resolve exceptions for a load
  app.post("/api/loads/:id/exceptions/resolve", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const loadId = req.params.id;
      const { type } = req.body || {};

      const load = await storage.getLoad(loadId);
      if (!load || load.brokerId !== broker.id) {
        return res.status(404).json({ error: "Load not found" });
      }

      const resolved = await storage.resolveExceptions(broker.id, loadId, type);

      return res.json({ ok: true, resolved });
    } catch (error) {
      console.error("Error in POST /api/loads/:id/exceptions/resolve:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // NOTIFICATION PREFERENCES API
  // ============================================

  // GET /api/notifications/preferences - Get notification preferences
  app.get("/api/notifications/preferences", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const preferences = await storage.ensureDefaultNotificationPreferences(broker.id);
      const channels: Record<string, boolean> = {};
      for (const pref of preferences) {
        channels[pref.channel] = pref.enabled;
      }

      return res.json({ channels });
    } catch (error) {
      console.error("Error in GET /api/notifications/preferences:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/notifications/preferences - Update notification preferences
  app.put("/api/notifications/preferences", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { channels } = req.body || {};
      if (!channels || typeof channels !== 'object') {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const validChannels = ['EMAIL_BROKER_STATUS', 'EMAIL_CLIENT_STATUS'];
      const updatedChannels: Record<string, boolean> = {};

      for (const [channel, enabled] of Object.entries(channels)) {
        if (validChannels.includes(channel) && typeof enabled === 'boolean') {
          await storage.upsertNotificationPreference(broker.id, channel, enabled);
          updatedChannels[channel] = enabled;
        }
      }

      const allPrefs = await storage.getNotificationPreferences(broker.id);
      const result: Record<string, boolean> = {};
      for (const pref of allPrefs) {
        result[pref.channel] = pref.enabled;
      }

      return res.json({ channels: result });
    } catch (error) {
      console.error("Error in PUT /api/notifications/preferences:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/billing/stripe/checkout-credits - Create Stripe checkout session for credits
  app.post("/api/billing/stripe/checkout-credits", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { quantity = 1 } = req.body;
      const qty = Math.min(Math.max(parseInt(quantity, 10) || 1, 1), 500);

      if (qty < 1) {
        return res.status(400).json({ error: "Quantity must be at least 1" });
      }

      const origin = getBaseUrl(req);
      const successUrl = `${origin}/app/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/app/billing`;

      const checkoutUrl = await createCheckoutSession(broker.id, qty, successUrl, cancelUrl);

      if (!checkoutUrl) {
        return res.status(500).json({ error: "Failed to create checkout session" });
      }

      return res.json({ url: checkoutUrl });
    } catch (error: any) {
      console.error("Error in POST /api/billing/stripe/checkout-credits:", error);
      // Return 503 for configuration issues so frontend knows payments aren't available
      if (error.message?.includes("not configured")) {
        return res.status(503).json({ 
          error: "Payment processing is not available. Please try again later.",
          code: "STRIPE_NOT_CONFIGURED"
        });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/billing/stripe/checkout-subscription - Create Stripe checkout session for Pro subscription
  app.post("/api/billing/stripe/checkout-subscription", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { promoCode } = req.body || {};

      const origin = getBaseUrl(req);
      const successUrl = `${origin}/app/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/app/billing`;

      const checkoutUrl = await createSubscriptionCheckoutSession(broker.id, broker.email, successUrl, cancelUrl, promoCode);

      if (!checkoutUrl) {
        return res.status(500).json({ error: "Failed to create checkout session" });
      }

      return res.json({ url: checkoutUrl });
    } catch (error: any) {
      console.error("Error in POST /api/billing/stripe/checkout-subscription:", error);
      if (error.message?.includes("not configured")) {
        return res.status(503).json({ 
          error: "Payment processing is not available. Please try again later.",
          code: "STRIPE_NOT_CONFIGURED"
        });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/billing/stripe/portal - Create Stripe billing portal session
  app.post("/api/billing/stripe/portal", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      let customerId: string | null;
      try {
        customerId = await getStripeCustomerByEmail(broker.email);
      } catch (error: any) {
        if (error.message?.includes("not configured")) {
          return res.status(503).json({ 
            error: "Billing portal is not available. Please try again later.",
            code: "STRIPE_NOT_CONFIGURED"
          });
        }
        throw error;
      }

      if (!customerId) {
        return res.status(400).json({ error: "No billing account found. Please subscribe first." });
      }

      const origin = getBaseUrl(req);
      const returnUrl = `${origin}/app/billing`;

      const portalUrl = await createBillingPortalSession(customerId, returnUrl);
      return res.json({ url: portalUrl });
    } catch (error: any) {
      console.error("Error in POST /api/billing/stripe/portal:", error);
      if (error.message?.includes("not configured")) {
        return res.status(503).json({ 
          error: "Billing portal is not available. Please try again later.",
          code: "STRIPE_NOT_CONFIGURED"
        });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/billing/stripe/webhook - Stripe webhook handler
  app.post("/api/billing/stripe/webhook", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const signature = req.headers["stripe-signature"] as string;

      if (!signature) {
        return res.status(400).json({ error: "Missing signature" });
      }

      // verifyWebhookSignature throws if Stripe is not configured - this prevents
      // unauthenticated callers from minting credits by crafting fake events
      const event = await verifyWebhookSignature(req.body, signature);
      const result = await processStripeEvent(event);

      console.log(`[Stripe Webhook] ${event.type}: ${result.message}`);
      return res.json({ received: true, ...result });
    } catch (error: any) {
      console.error("Error in Stripe webhook:", error.message);
      // Return 503 for configuration issues to indicate service unavailable
      if (error.message?.includes("not configured")) {
        return res.status(503).json({ error: "Webhook processing unavailable" });
      }
      return res.status(400).json({ error: error.message || "Webhook error" });
    }
  });

  // ==================== SOLANA PAY ENDPOINTS ====================

  // GET /api/billing/solana/merchant - Get merchant info for Solana Pay
  app.get("/api/billing/solana/merchant", async (_req: Request, res: Response) => {
    try {
      const info = getMerchantInfo();
      return res.json(info);
    } catch (error: any) {
      console.error("Error in GET /api/billing/solana/merchant:", error);
      return res.status(500).json({ error: "Failed to get merchant info" });
    }
  });

  // POST /api/billing/solana/pro-intent - Create PRO plan payment intent
  app.post("/api/billing/solana/pro-intent", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const merchantInfo = getMerchantInfo();
      if (!merchantInfo.configured) {
        return res.status(503).json({ 
          error: "Solana payments not configured. Please set SOLANA_MERCHANT_WALLET environment variable.",
          code: "SOLANA_NOT_CONFIGURED"
        });
      }

      const intent = await createProPaymentIntent(broker.id);
      return res.json(intent);
    } catch (error: any) {
      console.error("Error in POST /api/billing/solana/pro-intent:", error);
      if (error.message?.includes("SOLANA_MERCHANT_WALLET")) {
        return res.status(503).json({ 
          error: "Solana payments not configured",
          code: "SOLANA_NOT_CONFIGURED"
        });
      }
      return res.status(500).json({ error: "Failed to create payment intent" });
    }
  });

  // GET /api/billing/solana/intents/:intentId - Check payment intent status
  app.get("/api/billing/solana/intents/:intentId", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { intentId } = req.params;
      if (!intentId) {
        return res.status(400).json({ error: "Intent ID is required" });
      }

      const status = await checkAndConfirmIntent(intentId, broker.id);
      return res.json(status);
    } catch (error: any) {
      console.error("Error in GET /api/billing/solana/intents:", error);
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: "Payment intent not found" });
      }
      return res.status(500).json({ error: "Failed to check payment status" });
    }
  });

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // POST /api/rate-confirmations - Upload rate confirmation file (optionally attach to load)
  const ALLOWED_RC_MIMETYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  app.post("/api/rate-confirmations", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const file = req.file;
      const { loadId } = req.body;

      if (!file) {
        return res.status(400).json({ error: "File is required" });
      }

      if (!ALLOWED_RC_MIMETYPES.includes(file.mimetype)) {
        fs.unlinkSync(path.join(uploadsDir, file.filename));
        return res.status(400).json({ error: "Invalid file type. Please upload a PDF or image file." });
      }

      if (loadId) {
        const load = await storage.getLoad(loadId);
        if (!load || load.brokerId !== broker.id) {
          fs.unlinkSync(path.join(uploadsDir, file.filename));
          return res.status(404).json({ error: "Load not found or does not belong to you" });
        }
      }

      const relativePath = `/uploads/rate-confirmations/${file.filename}`;

      const rcFile = await storage.createRateConfirmationFile({
        brokerId: broker.id,
        loadId: loadId || null,
        fileUrl: relativePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      });

      const origin = getBaseUrl(req);
      const publicUrl = `${origin}${relativePath}`;

      return res.json({
        id: rcFile.id,
        url: publicUrl,
        originalName: rcFile.originalName,
        loadId: rcFile.loadId,
      });
    } catch (error) {
      console.error("Error uploading rate confirmation:", error);
      return res.status(500).json({ error: "Failed to upload rate confirmation" });
    }
  });

  // GET /api/rate-confirmations/:id/download - Download rate confirmation file
  app.get("/api/rate-confirmations/:id/download", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { id } = req.params;
      const rcFile = await storage.getRateConfirmationFileById(id);

      if (!rcFile || rcFile.brokerId !== broker.id) {
        return res.status(404).json({ error: "Rate confirmation not found" });
      }

      const filePath = path.join(process.cwd(), rcFile.fileUrl);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found on disk" });
      }

      res.setHeader("Content-Disposition", `attachment; filename="${rcFile.originalName}"`);
      if (rcFile.mimeType) {
        res.setHeader("Content-Type", rcFile.mimeType);
      }
      return res.sendFile(filePath);
    } catch (error) {
      console.error("Error downloading rate confirmation:", error);
      return res.status(500).json({ error: "Failed to download rate confirmation" });
    }
  });

  // POST /api/loads/:loadId/rate-confirmation - Upload rate confirmation file (legacy endpoint)
  app.post("/api/loads/:loadId/rate-confirmation", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { loadId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "File is required" });
      }

      const load = await storage.getLoad(loadId);
      if (!load || load.brokerId !== broker.id) {
        return res.status(404).json({ error: "Load not found" });
      }

      const relativePath = `/uploads/rate-confirmations/${file.filename}`;

      const rcFile = await storage.createRateConfirmationFile({
        brokerId: broker.id,
        loadId,
        fileUrl: relativePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      });

      const origin = getBaseUrl(req);
      const publicUrl = `${origin}${relativePath}`;

      return res.json({
        id: rcFile.id,
        url: publicUrl,
        originalName: rcFile.originalName,
      });
    } catch (error) {
      console.error("Error uploading rate confirmation:", error);
      return res.status(500).json({ error: "Failed to upload rate confirmation" });
    }
  });

  // GET /api/loads/export/csv - Export loads as CSV
  app.get("/api/loads/export/csv", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const allLoads = await storage.getLoadsByBroker(broker.id);
      const co2Factor = broker.co2FactorGramPerMile ? parseFloat(broker.co2FactorGramPerMile) : 1610;
      
      const headers = ["Load Number", "Shipper", "Carrier", "Equipment", "Rate", "Status", "Created", "Distance (mi)", "CO2 (kg)"];
      
      const rows = await Promise.all(allLoads.map(async (load) => {
        const stops = await storage.getStopsByLoad(load.id);
        let distanceMiles: number | null = load.distanceMiles ? parseFloat(load.distanceMiles) : null;
        if (distanceMiles === null && stops.length >= 2) {
          distanceMiles = analyticsService.computeDistanceFromStops(stops);
        }
        const co2Kg = distanceMiles ? Math.round((distanceMiles * co2Factor) / 1000 * 100) / 100 : null;
        
        return [
          load.loadNumber,
          load.shipperName,
          load.carrierName,
          load.equipmentType,
          load.rateAmount,
          load.status,
          load.createdAt.toISOString().split("T")[0],
          distanceMiles !== null ? distanceMiles.toString() : "",
          co2Kg !== null ? co2Kg.toString() : "",
        ];
      }));
      
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="loads-${Date.now()}.csv"`);
      return res.send(csvContent);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      return res.status(500).json({ error: "Failed to export CSV" });
    }
  });

  // POST /api/loads/:loadId/archive - Archive a single load
  app.post("/api/loads/:loadId/archive", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const load = await storage.getLoad(req.params.loadId);
      if (!load || load.brokerId !== broker.id) {
        return res.status(404).json({ error: "Load not found" });
      }

      const archived = await storage.archiveLoad(load.id);

      // Log activity (non-blocking)
      storage.createActivityLog({
        entityType: "load",
        entityId: load.id,
        action: "archived",
        actorType: "broker",
        actorId: broker.id,
        previousValue: JSON.stringify({ isArchived: false }),
        newValue: JSON.stringify({ isArchived: true }),
      }).catch(err => console.error("Error logging activity:", err));

      return res.json({ ok: true, load: archived });
    } catch (error) {
      console.error("Error archiving load:", error);
      return res.status(500).json({ error: "Failed to archive load" });
    }
  });

  // GET /api/loads/archived - Get archived loads
  app.get("/api/loads/archived", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const offset = (page - 1) * limit;

      const { loads, total } = await storage.getArchivedLoads(broker.id, limit, offset);

      return res.json({
        items: loads,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Error fetching archived loads:", error);
      return res.status(500).json({ error: "Failed to fetch archived loads" });
    }
  });

  // =============================================
  // ADMIN AUTH ROUTES
  // =============================================

  // POST /api/admin/login
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};

      if (!isAdminFullyConfigured()) {
        return res.status(503).json({ error: "Admin login not configured. Set ADMIN_EMAIL, ADMIN_PASSWORD, and JWT_SECRET." });
      }

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      if (validateAdminCredentials(email, password)) {
        const sessionCreated = createAdminSession(email, res);
        if (!sessionCreated) {
          return res.status(503).json({ error: "Admin session creation failed. JWT_SECRET may be missing." });
        }
        return res.json({ ok: true, email });
      }

      return res.status(401).json({ error: "Invalid admin credentials" });
    } catch (error) {
      console.error("Error in POST /api/admin/login:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/logout
  app.post("/api/admin/logout", (req: Request, res: Response) => {
    clearAdminSession(res);
    return res.json({ ok: true });
  });

  // GET /api/admin/me
  app.get("/api/admin/me", (req: Request, res: Response) => {
    const admin = getAdminFromRequest(req);
    if (admin) {
      return res.json({
        isAdmin: true,
        email: admin.email,
      });
    }
    return res.status(401).json({ isAdmin: false });
  });

  // =============================================
  // ADMIN DATA ROUTES (Protected)
  // =============================================

  // GET /api/admin/users - List all brokers with billing info
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(401).json({ error: "Admin auth required" });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const offset = (page - 1) * limit;

      const { brokers: brokersList, total } = await storage.getAllBrokers(limit, offset);

      // Enrich with billing info (using count queries for performance)
      const usersWithBilling = await Promise.all(
        brokersList.map(async (broker) => {
          const [entitlement, credits, totalLoads] = await Promise.all([
            storage.getBrokerEntitlement(broker.id),
            storage.getBrokerCredits(broker.id),
            storage.getAllLoadsCount(broker.id),
          ]);

          return {
            id: broker.id,
            email: broker.email,
            name: broker.name,
            phone: broker.phone,
            emailVerified: broker.emailVerified,
            createdAt: broker.createdAt,
            plan: entitlement?.plan || "FREE",
            loadsUsed: entitlement?.loadsUsed || 0,
            includedLoads: entitlement?.includedLoads || 3,
            cycleStartAt: entitlement?.cycleStartAt,
            cycleEndAt: entitlement?.cycleEndAt,
            creditsBalance: credits?.creditsBalance || 0,
            totalLoads,
          };
        })
      );

      return res.json({
        items: usersWithBilling,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Error in GET /api/admin/users:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/users/:id - Get single user details with loads
  app.get("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const broker = await storage.getBroker(req.params.id);
      if (!broker) {
        return res.status(404).json({ error: "User not found" });
      }

      const [entitlement, credits, totalLoads, loadsResult] = await Promise.all([
        storage.getBrokerEntitlement(broker.id),
        storage.getBrokerCredits(broker.id),
        storage.getAllLoadsCount(broker.id),
        storage.getLoadsByBrokerPaginated(broker.id, { limit: 50, offset: 0 }),
      ]);

      const loadsWithStops = await Promise.all(
        loadsResult.loads.map(async (load) => {
          const stopsData = await storage.getStopsByLoad(load.id);
          const pickup = stopsData.find(s => s.type === "PICKUP");
          const delivery = stopsData.find(s => s.type === "DELIVERY");
          return {
            id: load.id,
            loadNumber: load.loadNumber,
            createdAt: load.createdAt,
            status: load.status,
            rateAmount: load.rateAmount,
            pickupCity: pickup?.city,
            pickupState: pickup?.state,
            deliveryCity: delivery?.city,
            deliveryState: delivery?.state,
          };
        })
      );

      return res.json({
        user: {
          id: broker.id,
          email: broker.email,
          name: broker.name,
          phone: broker.phone,
          emailVerified: broker.emailVerified,
          isBlocked: broker.isBlocked || false,
          createdAt: broker.createdAt,
        },
        billing: {
          plan: entitlement?.plan || "FREE",
          loadsUsed: entitlement?.loadsUsed || 0,
          includedLoads: entitlement?.includedLoads || 3,
          cycleStartAt: entitlement?.cycleStartAt,
          cycleEndAt: entitlement?.cycleEndAt,
          creditsBalance: credits?.creditsBalance || 0,
        },
        loads: loadsWithStops,
        totalLoads,
      });
    } catch (error) {
      console.error("Error in GET /api/admin/users/:id:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // PATCH /api/admin/users/:id - Update user profile
  app.patch("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const broker = await storage.getBroker(req.params.id);
      if (!broker) {
        return res.status(404).json({ error: "User not found" });
      }

      const { name, phone, email } = req.body;
      const updates: Partial<{ name: string; phone: string; email: string }> = {};
      const changes: string[] = [];

      if (name !== undefined && name !== broker.name) {
        updates.name = name;
        changes.push(`name: "${broker.name}" → "${name}"`);
      }
      if (phone !== undefined && phone !== broker.phone) {
        updates.phone = phone;
        changes.push(`phone: "${broker.phone || ''}" → "${phone || ''}"`);
      }
      if (email !== undefined && email !== broker.email) {
        const existing = await storage.getBrokerByEmail(email);
        if (existing && existing.id !== broker.id) {
          return res.status(400).json({ error: "Email already in use by another user" });
        }
        updates.email = email;
        changes.push(`email: "${broker.email}" → "${email}"`);
      }

      if (Object.keys(updates).length === 0) {
        return res.json({ ok: true, message: "No changes" });
      }

      const updated = await storage.updateBroker(broker.id, updates);

      await storage.createAdminAuditLog({
        actorBrokerId: admin.id,
        actorEmail: admin.email,
        targetBrokerId: broker.id,
        action: "UPDATE_PROFILE",
        metadata: JSON.stringify({ changes }),
      });

      return res.json({ ok: true, user: updated });
    } catch (error) {
      console.error("Error in PATCH /api/admin/users/:id:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/users/:id/block - Toggle user block status
  app.post("/api/admin/users/:id/block", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const broker = await storage.getBroker(req.params.id);
      if (!broker) {
        return res.status(404).json({ error: "User not found" });
      }

      const { isBlocked } = req.body;
      if (typeof isBlocked !== "boolean") {
        return res.status(400).json({ error: "isBlocked must be a boolean" });
      }

      const updated = await storage.updateBroker(broker.id, { isBlocked });

      await storage.createAdminAuditLog({
        actorBrokerId: admin.id,
        actorEmail: admin.email,
        targetBrokerId: broker.id,
        action: isBlocked ? "BLOCK_USER" : "UNBLOCK_USER",
        metadata: JSON.stringify({ previousStatus: broker.isBlocked, newStatus: isBlocked }),
      });

      return res.json({ ok: true, isBlocked: updated?.isBlocked });
    } catch (error) {
      console.error("Error in POST /api/admin/users/:id/block:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/users/:id/export - Export user loads as CSV
  app.get("/api/admin/users/:id/export", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const broker = await storage.getBroker(req.params.id);
      if (!broker) {
        return res.status(404).json({ error: "User not found" });
      }

      const allLoads = await storage.getLoadsByBroker(broker.id);

      const loadsWithStops = await Promise.all(
        allLoads.map(async (load) => {
          const stopsData = await storage.getStopsByLoad(load.id);
          const pickup = stopsData.find(s => s.type === "PICKUP");
          const delivery = stopsData.find(s => s.type === "DELIVERY");
          return {
            loadId: load.id,
            loadNumber: load.loadNumber,
            createdAt: load.createdAt?.toISOString() || "",
            pickupName: pickup?.name || "",
            pickupCity: pickup?.city || "",
            pickupState: pickup?.state || "",
            deliveryName: delivery?.name || "",
            deliveryCity: delivery?.city || "",
            deliveryState: delivery?.state || "",
            rate: load.rateAmount,
            status: load.status,
          };
        })
      );

      const csvHeaders = "Load ID,Load Number,Created At,Pickup Facility,Pickup City,Pickup State,Delivery Facility,Delivery City,Delivery State,Rate,Status";
      const csvRows = loadsWithStops.map(l =>
        `"${l.loadId}","${l.loadNumber}","${l.createdAt}","${l.pickupName}","${l.pickupCity}","${l.pickupState}","${l.deliveryName}","${l.deliveryCity}","${l.deliveryState}","${l.rate}","${l.status}"`
      );
      const csv = [csvHeaders, ...csvRows].join("\n");

      const sanitizedEmail = broker.email.replace(/[^a-zA-Z0-9]/g, "_");

      await storage.createAdminAuditLog({
        actorBrokerId: admin.id,
        actorEmail: admin.email,
        targetBrokerId: broker.id,
        action: "EXPORT_CSV",
        metadata: JSON.stringify({ totalLoads: loadsWithStops.length }),
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="broker-${sanitizedEmail}-loads.csv"`);
      return res.send(csv);
    } catch (error) {
      console.error("Error in GET /api/admin/users/:id/export:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/users/:id/update-usage - Update user billing/usage
  app.post("/api/admin/users/:id/update-usage", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const broker = await storage.getBroker(req.params.id);
      if (!broker) {
        return res.status(404).json({ error: "User not found" });
      }

      const { loadsUsed, plan, includedLoads, cycleEndAt } = req.body;

      const updateData: any = {};
      if (loadsUsed !== undefined) updateData.loadsUsed = loadsUsed;
      if (plan !== undefined) updateData.plan = plan;
      if (includedLoads !== undefined) updateData.includedLoads = includedLoads;
      if (cycleEndAt !== undefined) updateData.cycleEndAt = new Date(cycleEndAt);

      const entitlement = await storage.updateBrokerEntitlement(broker.id, updateData);

      // Log admin action
      await storage.createAdminAuditLog({
        actorBrokerId: admin.id,
        actorEmail: admin.email,
        targetBrokerId: broker.id,
        action: "UPDATE_USAGE",
        metadata: JSON.stringify({ updates: updateData }),
      });

      return res.json({ ok: true, entitlement });
    } catch (error) {
      console.error("Error in POST /api/admin/users/:id/update-usage:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/users/:id/add-credits - Add load credits
  app.post("/api/admin/users/:id/add-credits", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const broker = await storage.getBroker(req.params.id);
      if (!broker) {
        return res.status(404).json({ error: "User not found" });
      }

      const { credits } = req.body;
      if (!credits || credits <= 0) {
        return res.status(400).json({ error: "Credits must be a positive number" });
      }

      const updated = await storage.addBrokerCredits(broker.id, credits);

      // Log admin action
      await storage.createAdminAuditLog({
        actorBrokerId: admin.id,
        actorEmail: admin.email,
        targetBrokerId: broker.id,
        action: "ADD_CREDITS",
        metadata: JSON.stringify({ credits, newBalance: updated?.creditsBalance }),
      });

      return res.json({ ok: true, credits: updated });
    } catch (error) {
      console.error("Error in POST /api/admin/users/:id/add-credits:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/subscriptions - Get all active subscriptions
  app.get("/api/admin/subscriptions", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const subscriptions = await storage.getActiveSubscriptions();

      // Enrich with broker info
      const enriched = await Promise.all(
        subscriptions.map(async (sub) => {
          const broker = await storage.getBroker(sub.brokerId);
          return {
            ...sub,
            brokerEmail: broker?.email,
            brokerName: broker?.name,
          };
        })
      );

      return res.json({ subscriptions: enriched });
    } catch (error) {
      console.error("Error in GET /api/admin/subscriptions:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/logs - Get admin audit logs
  app.get("/api/admin/logs", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = (page - 1) * limit;

      const { logs, total } = await storage.getAdminAuditLogs(limit, offset);

      return res.json({
        items: logs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Error in GET /api/admin/logs:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/promotions - Get all promotions
  app.get("/api/admin/promotions", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const promos = await storage.getPromotions();
      return res.json({ promotions: promos });
    } catch (error) {
      console.error("Error in GET /api/admin/promotions:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/promotions - Create promotion
  app.post("/api/admin/promotions", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { code, description, discountType, discountValue, validFrom, validTo, maxRedemptions } = req.body;

      if (!code || !discountType || discountValue === undefined) {
        return res.status(400).json({ error: "Code, discountType, and discountValue are required" });
      }

      const promo = await storage.createPromotion({
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validTo: validTo ? new Date(validTo) : undefined,
        maxRedemptions,
      });

      // Log admin action
      await storage.createAdminAuditLog({
        actorBrokerId: admin.id,
        actorEmail: admin.email,
        action: "CREATE_PROMOTION",
        metadata: JSON.stringify({ code: promo.code, discountType, discountValue }),
      });

      return res.json({ ok: true, promotion: promo });
    } catch (error) {
      console.error("Error in POST /api/admin/promotions:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/admin/referrals - Get all referrals
  app.get("/api/admin/referrals", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const refs = await storage.getReferrals();

      // Enrich with broker info
      const enriched = await Promise.all(
        refs.map(async (ref) => {
          const referrer = await storage.getBroker(ref.referrerId);
          const referred = ref.referredId ? await storage.getBroker(ref.referredId) : null;
          return {
            ...ref,
            referrerEmail: referrer?.email,
            referrerName: referrer?.name,
            referredEmail: referred?.email,
            referredName: referred?.name,
          };
        })
      );

      return res.json({ referrals: enriched });
    } catch (error) {
      console.error("Error in GET /api/admin/referrals:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/admin/referral-code - Set a broker's referral code
  app.post("/api/admin/referral-code", async (req: Request, res: Response) => {
    try {
      const admin = await requireAdminAuth(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { brokerId, code } = req.body;

      if (!brokerId || !code) {
        return res.status(400).json({ error: "brokerId and code are required" });
      }

      const updatedBroker = await storage.updateBrokerReferralCode(brokerId, code.toUpperCase());
      if (!updatedBroker) {
        return res.status(404).json({ error: "Broker not found" });
      }

      // Log admin action
      await storage.createAdminAuditLog({
        actorBrokerId: admin.id,
        actorEmail: admin.email,
        action: "SET_REFERRAL_CODE",
        targetBrokerId: brokerId,
        metadata: JSON.stringify({ code: code.toUpperCase() }),
      });

      return res.json({ ok: true, referralCode: updatedBroker.referralCode });
    } catch (error) {
      console.error("Error in POST /api/admin/referral-code:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // SHIPPERS & RECEIVERS ENDPOINTS
  // ============================================

  // GET /api/shippers - List shippers
  app.get("/api/shippers", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { search, page = "1", limit = "20" } = req.query;

      const result = await storage.getShippersByBroker(broker.id, {
        search: search as string | undefined,
        page: parseInt(page as string, 10) || 1,
        limit: parseInt(limit as string, 10) || 20,
      });

      return res.json({
        items: result.items,
        page: parseInt(page as string, 10) || 1,
        limit: parseInt(limit as string, 10) || 20,
        total: result.total,
      });
    } catch (error) {
      console.error("Error in GET /api/shippers:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/shippers - Create a shipper
  app.post("/api/shippers", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { name, address1, address2, city, state, zip, contactName, phone, email } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      const shipper = await storage.createShipper({
        brokerId: broker.id,
        name,
        address1: address1 || null,
        address2: address2 || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        contactName: contactName || null,
        phone: phone || null,
        email: email || null,
      });

      return res.json(shipper);
    } catch (error) {
      console.error("Error in POST /api/shippers:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/receivers - List receivers
  app.get("/api/receivers", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { search, page = "1", limit = "20" } = req.query;

      const result = await storage.getReceiversByBroker(broker.id, {
        search: search as string | undefined,
        page: parseInt(page as string, 10) || 1,
        limit: parseInt(limit as string, 10) || 20,
      });

      return res.json({
        items: result.items,
        page: parseInt(page as string, 10) || 1,
        limit: parseInt(limit as string, 10) || 20,
        total: result.total,
      });
    } catch (error) {
      console.error("Error in GET /api/receivers:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/receivers - Create a receiver
  app.post("/api/receivers", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { name, address1, address2, city, state, zip, contactName, phone, email } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      const receiver = await storage.createReceiver({
        brokerId: broker.id,
        name,
        address1: address1 || null,
        address2: address2 || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        contactName: contactName || null,
        phone: phone || null,
        email: email || null,
      });

      return res.json(receiver);
    } catch (error) {
      console.error("Error in POST /api/receivers:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // ANALYTICS ENDPOINTS
  // ============================================

  // Helper to parse days from various query param names
  function parseDaysParam(query: Record<string, unknown>): number {
    const raw = query.days ?? query.range ?? query.period;
    const n = Number(raw);
    if ([7, 30, 90].includes(n)) return n;
    return 30;
  }

  // GET /api/analytics/overview - Get analytics overview
  // Also handles /api/analytics for backward compatibility
  const analyticsOverviewHandler = async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { from, to } = req.query;
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to ? new Date(to as string) : undefined;

      const plan = await analyticsService.getBrokerPlan(broker.id);

      // Free plan: limit to last 30 days
      let effectiveFrom = fromDate;
      let effectiveTo = toDate;
      let limited = false;

      if (plan === "FREE") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (!effectiveFrom || effectiveFrom < thirtyDaysAgo) {
          effectiveFrom = thirtyDaysAgo;
          limited = true;
        }
        effectiveTo = effectiveTo || new Date();
      }

      const overview = await analyticsService.getAnalyticsOverview(broker.id, effectiveFrom, effectiveTo);

      // For free plan, limit driver/shipper breakdowns
      if (plan === "FREE") {
        overview.byDrivers = overview.byDrivers.slice(0, 5);
        overview.byShippers = overview.byShippers.slice(0, 5);
      }

      return res.json({ ...overview, plan, limited });
    } catch (error) {
      console.error("Error in GET /api/analytics/overview:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
  
  // Register analytics overview on multiple routes for backward compatibility
  app.get("/api/analytics/overview", analyticsOverviewHandler);
  app.get("/api/analytics", analyticsOverviewHandler);

  // GET /api/analytics/loads - Get paginated loads with analytics
  // Also handles /api/analytics/loads-detail for backward compatibility
  const analyticsLoadsHandler = async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { from, to, page = "1", limit = "50" } = req.query;
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to ? new Date(to as string) : undefined;
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);

      const plan = await analyticsService.getBrokerPlan(broker.id);

      // Free plan: limit to 50 rows max
      const effectiveLimit = plan === "FREE" ? Math.min(limitNum, 50) : limitNum;

      const result = await analyticsService.getAnalyticsLoadsTable(broker.id, fromDate, toDate, pageNum, effectiveLimit);

      return res.json({ ...result, plan, limited: plan === "FREE" });
    } catch (error) {
      console.error("Error in GET /api/analytics/loads:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
  
  // Register analytics loads on multiple routes for backward compatibility
  app.get("/api/analytics/loads", analyticsLoadsHandler);
  app.get("/api/analytics/loads-detail", analyticsLoadsHandler);

  // GET /api/analytics/loads.csv - Export loads as CSV
  app.get("/api/analytics/loads.csv", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { from, to } = req.query;
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to ? new Date(to as string) : undefined;

      const plan = await analyticsService.getBrokerPlan(broker.id);

      // Free plan: limit to 50 rows
      const limit = plan === "FREE" ? 50 : 1000;

      const result = await analyticsService.getAnalyticsLoadsTable(broker.id, fromDate, toDate, 1, limit);
      const csv = analyticsService.generateLoadsCsv(result.items);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=analytics-loads.csv");
      return res.send(csv);
    } catch (error) {
      console.error("Error in GET /api/analytics/loads.csv:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
