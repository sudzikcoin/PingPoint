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

// TODO: Integrate real email provider (SendGrid/Postmark/etc.)
async function sendVerificationEmail(email: string, url: string): Promise<void> {
  console.log(`[EMAIL] Send verification to ${email}: ${url}`);
}

// TODO: Integrate real SMS provider (Twilio/etc.)
async function sendDriverSMS(phone: string, url: string): Promise<void> {
  console.log(`[SMS] Send driver link to ${phone}: ${url}`);
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

      const origin = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : `http://localhost:5000`;
      // Point to the SPA verification page, not the API endpoint
      const verificationUrl = `${origin}/verify?token=${token}`;

      await sendVerificationEmail(broker.email, verificationUrl);

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

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: "Invalid token" });
      }

      const verificationToken = await storage.getVerificationToken(token);

      if (!verificationToken || verificationToken.used || verificationToken.expiresAt < new Date()) {
        return res.status(400).json({ error: "Token is invalid or expired" });
      }

      await storage.markTokenUsed(verificationToken.id);
      await storage.updateBroker(verificationToken.brokerId, { emailVerified: true });

      createBrokerSession(verificationToken.brokerId, res);
      
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

  // Load endpoints

  // POST /api/loads - Create new load
  app.post("/api/loads", async (req: Request, res: Response) => {
    try {
      // Try to get broker from session first
      let broker = await getBrokerFromRequest(req);
      
      // If no session, allow creation with brokerEmail from body (for demo flow)
      if (!broker) {
        const { brokerEmail, brokerName } = req.body;
        if (!brokerEmail) {
          return res.status(401).json({ error: "Unauthorized - no session or brokerEmail provided" });
        }
        
        const emailNormalized = brokerEmail.trim().toLowerCase();
        broker = await storage.getBrokerByEmail(emailNormalized) || null;
        
        if (!broker) {
          broker = await storage.createBroker({
            email: emailNormalized,
            name: brokerName || "Broker",
          });
        }
        
        // Set session cookie for future requests
        createBrokerSession(broker.id, res);
      }

      const { driverPhone, stops: stopsData, brokerEmail: _be, brokerName: _bn, ...loadData } = req.body;

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

      // Send notifications
      if (!broker.emailVerified) {
        // Trigger verification email (call the endpoint internally)
        sendVerificationEmail(broker.email, "verification-link-here");
      }

      if (driver) {
        const origin = process.env.REPL_SLUG 
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
          : `http://localhost:5000`;
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

      const origin = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : `http://localhost:5000`;
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
