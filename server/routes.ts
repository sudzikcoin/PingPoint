import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createBrokerSession, getBrokerFromRequest, clearBrokerSession, getOrCreateTrustedDevice, getTrustedDevice } from "./auth";
import { randomBytes } from "crypto";
import { insertLoadSchema, insertStopSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { sendBrokerVerificationEmail, sendDriverAppLink } from "./email";
import { strictRateLimit } from "./middleware/rateLimit";
import { checkAndConsumeLoadAllowance, rollbackLoadAllowance, getBillingSummary, FREE_INCLUDED_LOADS } from "./billing/entitlements";
import { createCheckoutSession, verifyWebhookSignature, processStripeEvent } from "./billing/stripe";
import { incrementLoadsCreated, getUsageSummary } from "./billing/usage";
import { createProPaymentIntent, checkAndConfirmIntent, getMerchantInfo } from "./billing/solana";
import { evaluateGeofencesForActiveLoad } from "./geofence";

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
  // Broker endpoints

  // POST /api/brokers/ensure - Find or create broker
  app.post("/api/brokers/ensure", async (req: Request, res: Response) => {
    try {
      const { email, name } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const emailNormalized = email.trim().toLowerCase();
      const brokerName = (name || "Broker").trim();

      let broker = await storage.getBrokerByEmail(emailNormalized);
      
      if (!broker) {
        broker = await storage.createBroker({
          email: emailNormalized,
          name: brokerName,
        });
      }

      return res.json({
        id: broker.id,
        email: broker.email,
        name: broker.name,
        emailVerified: broker.emailVerified,
        createdAt: broker.createdAt,
        updatedAt: broker.updatedAt,
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
      const broker = await getBrokerFromRequest(req);
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

  // GET /api/loads - List loads for current broker (with pagination)
  app.get("/api/loads", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
      const status = req.query.status as string | undefined;
      const offset = (page - 1) * limit;

      const { loads: allLoads, total } = await storage.getLoadsByBrokerPaginated(
        broker.id, 
        { limit, offset, status }
      );

      const enrichedLoads = await Promise.all(
        allLoads.map(async (load) => {
          const loadStops = await storage.getStopsByLoad(load.id);
          const pickupStop = loadStops.find(s => s.type === 'PICKUP');
          const deliveryStop = loadStops.find(s => s.type === 'DELIVERY');

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

      return res.json({
        id: load.id,
        loadNumber: load.loadNumber,
        customerRef: load.customerRef,
        status: load.status,
        stops: loadStops,
      });
    } catch (error) {
      console.error("Error in /api/driver/:token:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/driver/:token/ping - Submit location ping (rate limited: 60 per minute)
  app.post("/api/driver/:token/ping", strictRateLimit(60, 60000), async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { lat, lng, accuracy } = req.body;

      const load = await storage.getLoadByToken(token, 'driver');
      if (!load || !load.driverId) {
        return res.status(404).json({ error: "Load not found" });
      }

      const ping = await storage.createTrackingPing({
        loadId: load.id,
        driverId: load.driverId,
        lat: lat.toString(),
        lng: lng.toString(),
        accuracy: accuracy ? accuracy.toString() : null,
        source: "DRIVER_APP",
      });

      // Evaluate geofences for auto-arrive/depart (non-blocking)
      evaluateGeofencesForActiveLoad(load.driverId, load.id, parseFloat(lat), parseFloat(lng))
        .catch(err => console.error("Error evaluating geofences:", err));

      return res.json({ ok: true, pingId: ping.id });
    } catch (error) {
      console.error("Error in /api/driver/:token/ping:", error);
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

      const updateData: any = {};
      if (arrivedAt) updateData.arrivedAt = new Date(arrivedAt);
      if (departedAt) updateData.departedAt = new Date(departedAt);

      const stop = await storage.updateStop(stopId, updateData);

      return res.json({ ok: true, stop });
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

  // POST /api/loads/:loadId/rate-confirmation - Upload rate confirmation file
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
        loadId,
        fileUrl: relativePath,
        originalName: file.originalname,
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
      
      const headers = ["Load Number", "Shipper", "Carrier", "Equipment", "Rate", "Status", "Created"];
      const rows = allLoads.map(load => [
        load.loadNumber,
        load.shipperName,
        load.carrierName,
        load.equipmentType,
        load.rateAmount,
        load.status,
        load.createdAt.toISOString().split("T")[0],
      ]);
      
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
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

  return httpServer;
}
