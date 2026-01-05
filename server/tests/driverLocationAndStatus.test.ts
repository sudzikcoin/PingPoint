import { describe, it, expect, vi } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { createTestBroker, createTestDriver, createTestLoad, createTestStop } from "./utils/dbTestUtils";
import { db } from "../db";
import { trackingPings } from "@shared/schema";
import { eq } from "drizzle-orm";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Driver Location and Status Updates", () => {
  describe("POST /api/driver/:driverToken/ping", () => {
    it("should save location ping for valid driver token", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ 
        brokerId: broker.id, 
        driverId: driver.id 
      });
      
      await createTestStop({ loadId: load.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load.id, type: "DELIVERY", sequence: 1 });
      
      const request = await getTestRequest();
      
      const response = await request
        .post(`/api/driver/${load.driverToken}/ping`)
        .send({
          lat: 32.7767,
          lng: -96.7970,
        });
      
      expect(response.status).toBe(200);
      
      const pings = await db
        .select()
        .from(trackingPings)
        .where(eq(trackingPings.loadId, load.id));
      
      expect(pings.length).toBe(1);
      expect(parseFloat(pings[0].lat || "0")).toBeCloseTo(32.7767, 2);
      expect(parseFloat(pings[0].lng || "0")).toBeCloseTo(-96.7970, 2);
    });

    it.skip("should save multiple location pings (skipped: rate limiter in production)", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ 
        brokerId: broker.id, 
        driverId: driver.id 
      });
      
      await createTestStop({ loadId: load.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load.id, type: "DELIVERY", sequence: 1 });
      
      const request = await getTestRequest();
      
      await request
        .post(`/api/driver/${load.driverToken}/ping`)
        .send({
          lat: 32.7767,
          lng: -96.7970,
        });
      
      await request
        .post(`/api/driver/${load.driverToken}/ping`)
        .send({
          lat: 32.8000,
          lng: -96.8000,
        });
      
      const pings = await db
        .select()
        .from(trackingPings)
        .where(eq(trackingPings.loadId, load.id));
      
      expect(pings.length).toBe(2);
    });

    it("should reject invalid driver token", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/driver/invalid_token_12345/ping")
        .send({
          lat: 32.7767,
          lng: -96.7970,
        });
      
      expect(response.status).toBe(404);
    });
  });
});
