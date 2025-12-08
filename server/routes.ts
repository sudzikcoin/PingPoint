import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createBrokerSession, getBrokerFromRequest, clearBrokerSession } from "./auth";
import { randomBytes } from "crypto";
import { insertLoadSchema, insertStopSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { sendBrokerVerificationEmail, sendDriverAppLink } from "./email";

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
async function sendVerificationEmail(email: string, url: string, brokerName?: string): Promise<void> {
  await sendBrokerVerificationEmail(email, url, brokerName);
}

// Wrapper for driver SMS (TODO: integrate Twilio)
async function sendDriverSMS(phone: string, url: string): Promise<void> {
  await sendDriverAppLink(phone, url);
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

  // POST /api/brokers/send-verification
  app.post("/api/brokers/send-verification", async (req: Request, res: Response) => {
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

      await sendVerificationEmail(broker.email, verificationUrl, broker.name);

      return res.json({ ok: true });
    } catch (error) {
      console.error("Error in /api/brokers/send-verification:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/brokers/verify - Called by SPA to verify token
  app.post("/api/brokers/verify", async (req: Request, res: Response) => {
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
      console.log(`[Verify] Session created for broker ${verificationToken.brokerId}, redirecting to /app/loads`);
      
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

      const { name, phone, timezone } = req.body;
      // Note: email is NOT updatable via this endpoint for security reasons
      // Email changes would require re-verification flow

      const updatedBroker = await storage.updateBroker(broker.id, {
        name: name || broker.name,
        phone: phone || null,
        timezone: timezone || broker.timezone,
      });

      return res.json({
        id: updatedBroker?.id,
        name: updatedBroker?.name,
        email: updatedBroker?.email, // Return current email (not editable)
        phone: updatedBroker?.phone || "",
        timezone: updatedBroker?.timezone || "Central (CT)",
        emailVerified: updatedBroker?.emailVerified,
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
  app.post("/api/loads", async (req: Request, res: Response) => {
    try {
      // Try to get broker from session first
      let broker = await getBrokerFromRequest(req);
      
      // If no session, allow creation with brokerEmail from body (for demo flow)
      if (!broker) {
        const { brokerEmail, brokerName, brokerPhone, timezone } = req.body;
        if (!brokerEmail) {
          return res.status(401).json({ error: "Unauthorized - no session or brokerEmail provided" });
        }
        
        const emailNormalized = brokerEmail.trim().toLowerCase();
        broker = await storage.getBrokerByEmail(emailNormalized) || null;
        
        if (!broker) {
          // Create new broker with profile data from form
          broker = await storage.createBroker({
            email: emailNormalized,
            name: brokerName || "Broker",
            phone: brokerPhone || null,
            timezone: timezone || "Central (CT)",
          });
        } else {
          // Update broker profile with any missing fields
          const updates: any = {};
          if (!broker.phone && brokerPhone) updates.phone = brokerPhone;
          if (!broker.timezone && timezone) updates.timezone = timezone;
          if (!broker.name && brokerName) updates.name = brokerName;
          
          if (Object.keys(updates).length > 0) {
            broker = await storage.updateBroker(broker.id, updates) || broker;
          }
        }
        
        // Set session cookie for future requests
        createBrokerSession(broker.id, res);
      } else {
        // For existing session, optionally update profile with missing fields
        const { brokerPhone, timezone } = req.body;
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

      // Send notifications
      const origin = getBaseUrl(req);
      
      if (!broker.emailVerified) {
        // Create verification token and send real email
        const verifyToken = randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 2); // Expires in 2 days
        await storage.createVerificationToken(broker.id, verifyToken, expiresAt);
        
        const verificationUrl = `${origin}/verify?token=${verifyToken}`;
        console.log(`[PingPoint] Sending verification email to ${broker.email} with URL: ${verificationUrl}`);
        await sendVerificationEmail(broker.email, verificationUrl, broker.name);
      }

      if (driver) {
        const driverAppUrl = `${origin}/driver/${driverToken}`;
        await sendDriverSMS(driver.phone, driverAppUrl);
      }

      return res.status(201).json({
        id: load.id,
        loadNumber: load.loadNumber,
        status: load.status,
        trackingToken: load.trackingToken,
        driverToken: load.driverToken,
      });
    } catch (error) {
      console.error("Error in /api/loads:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/loads - List loads for current broker
  app.get("/api/loads", async (req: Request, res: Response) => {
    try {
      const broker = await getBrokerFromRequest(req);
      if (!broker) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const loads = await storage.getLoadsByBroker(broker.id);

      // Enrich loads with stop data
      const enrichedLoads = await Promise.all(
        loads.map(async (load) => {
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
        total: enrichedLoads.length,
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

  // POST /api/driver/:token/ping - Submit location ping
  app.post("/api/driver/:token/ping", async (req: Request, res: Response) => {
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

  return httpServer;
}
