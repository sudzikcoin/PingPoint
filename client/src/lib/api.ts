import { db } from "./db";
import { sendBrokerVerificationEmail, sendDriverAppLink } from "./notifications";

// Simulation of backend API routes
// This file acts as the "client SDK" for our mock backend
// It now uses the `db` module which mirrors the Prisma schema.

export const api = {
  brokers: {
    ensure: async (email: string, name: string) => {
      // Simulates POST /api/brokers/ensure
      let broker = await db.broker.findUnique({ email });
      
      if (!broker) {
        broker = await db.broker.create({
          data: {
            email,
            name,
            emailVerified: false
          }
        });
        
        // Set session cookie simulation
        if (typeof window !== 'undefined') {
          localStorage.setItem("pingpoint-current-broker", JSON.stringify(broker));
        }
      } else {
        // Update session
         if (typeof window !== 'undefined') {
          localStorage.setItem("pingpoint-current-broker", JSON.stringify(broker));
        }
      }

      return broker;
    },
    
    sendVerification: async (brokerId: string) => {
      // Simulates POST /api/brokers/send-verification
      const token = `verify_${Math.random().toString(36).substring(2, 15)}`;
      const expires = new Date();
      expires.setDate(expires.getDate() + 2);

      await db.verificationToken.create({
        data: {
          brokerId,
          token,
          expiresAt: expires.toISOString(),
          used: false
        }
      });

      const origin = window.location.origin;
      const verificationUrl = `${origin}/verify?token=${token}`;
      
      console.log(`[MOCK API] Generated verification token: ${token}`);
      console.log(`[MOCK API] Verification URL: ${verificationUrl}`);
      
      return { ok: true };
    },
    
    verify: async (token: string) => {
      // Simulates GET /api/brokers/verify
      const record = await db.verificationToken.findUnique({ token });
      
      if (!record || record.used || new Date(record.expiresAt) < new Date()) {
        return false;
      }
      
      await db.verificationToken.update({
        where: { id: record.id },
        data: { used: true }
      });
      
      await db.broker.update({
        where: { id: record.brokerId },
        data: { emailVerified: true }
      });
      
      // Refresh session
      const broker = await db.broker.findUnique({ id: record.brokerId });
      if (broker && typeof window !== 'undefined') {
        localStorage.setItem("pingpoint-current-broker", JSON.stringify(broker));
      }
      
      return true;
    },
    
    me: async () => {
      // Simulates GET /api/brokers/me
      if (typeof window === 'undefined') return null;
      const stored = localStorage.getItem("pingpoint-current-broker");
      if (!stored) throw new Error("Unauthorized");
      return JSON.parse(stored);
    }
  },
  
  loads: {
    create: async (data: any) => {
      // Simulates POST /api/loads
      const currentBroker = await api.brokers.me();
      
      // Ensure Driver
      let driverId = null;
      if (data.driverPhone) {
        let driver = await db.driver.findFirst({ phone: data.driverPhone });
        if (!driver) {
          driver = await db.driver.create({ data: { phone: data.driverPhone }});
        }
        driverId = driver.id;
      }
      
      // Generate tokens
      const trackingToken = `trk_${Math.random().toString(36).substring(2, 9)}`;
      const driverToken = `drv_${Math.random().toString(36).substring(2, 9)}`;
      const loadNumber = `LD-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`;
      
      // Create Load via "Prisma"
      const newLoad = await db.load.create({
        data: {
          brokerId: currentBroker.id,
          driverId,
          loadNumber,
          shipperName: data.shipperName,
          carrierName: data.carrierName,
          equipmentType: data.equipmentType,
          customerRef: data.customerReference,
          rateAmount: data.rateAmount,
          status: "PLANNED",
          trackingToken,
          driverToken,
          isBillable: true,
          stops: {
            createMany: {
              data: data.stops.map((s: any, i: number) => ({
                sequence: i + 1,
                type: s.type,
                name: s.name,
                fullAddress: `${s.addressLine1}, ${s.city}, ${s.state} ${s.zip}`,
                city: s.city,
                state: s.state,
                windowFrom: s.windowStart,
                windowTo: s.windowEnd
              }))
            }
          }
        }
      });
      
      // Trigger notifications
      if (!currentBroker.emailVerified) {
        await api.brokers.sendVerification(currentBroker.id);
      }
      
      if (data.driverPhone) {
        await sendDriverAppLink({
          phone: data.driverPhone,
          loadId: newLoad.id // In real app this might be driverToken
        });
      }
      
      // Map back to frontend model for compatibility
      return {
        ...newLoad,
        brokerName: currentBroker.name,
        stops: newLoad.stops.map((s: any) => ({
          ...s,
          addressLine1: s.fullAddress.split(',')[0],
          zip: s.fullAddress.split(' ').pop(),
          windowStart: s.windowFrom,
          windowEnd: s.windowTo
        })),
        externalLoadId: newLoad.loadNumber
      };
    },
    
    list: async (params?: any) => {
      // Simulates GET /api/loads
      const currentBroker = await api.brokers.me();
      const loads = await db.load.findMany({ where: { brokerId: currentBroker.id } });
      
      // Map to frontend model
      return loads.map((l: any) => ({
        ...l,
        externalLoadId: l.loadNumber,
        brokerName: currentBroker.name, // Simplified join
        stops: l.stops.map((s: any) => ({
          ...s,
          addressLine1: s.fullAddress.split(',')[0],
          zip: s.fullAddress.split(' ').pop(),
          windowStart: s.windowFrom,
          windowEnd: s.windowTo
        }))
      }));
    },
    
    get: async (id: string) => {
      // Simulates GET /api/loads/[id]
      const load = await db.load.findUnique({ id });
      if (!load) return null;
      
      const currentBroker = await api.brokers.me();

      return {
        ...load,
        externalLoadId: load.loadNumber,
        brokerName: currentBroker.name,
        stops: load.stops.map((s: any) => ({
          ...s,
          addressLine1: s.fullAddress.split(',')[0],
          zip: s.fullAddress.split(' ').pop(),
          windowStart: s.windowFrom,
          windowEnd: s.windowTo
        }))
      };
    }
  }
};
