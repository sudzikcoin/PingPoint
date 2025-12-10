import { describe, it, expect, vi } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { createTestBroker, createTestDriver, createTestLoad, createTestStop, createTestTrackingPing } from "./utils/dbTestUtils";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Public Tracking", () => {
  describe("GET /api/track/:trackingToken", () => {
    it("should return load tracking data for valid token", async () => {
      const broker = await createTestBroker({ 
        email: "broker@private.com",
        emailVerified: true 
      });
      const driver = await createTestDriver();
      const load = await createTestLoad({ 
        brokerId: broker.id, 
        driverId: driver.id,
        customerRef: "PUBLIC-REF-001",
        status: "IN_TRANSIT"
      });
      
      await createTestStop({ loadId: load.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load.id, type: "DELIVERY", sequence: 1 });
      
      await createTestTrackingPing({
        loadId: load.id,
        driverId: driver.id,
        lat: "32.7767",
        lng: "-96.7970",
      });
      
      const request = await getTestRequest();
      
      const response = await request
        .get(`/api/track/${load.trackingToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("status", "IN_TRANSIT");
      expect(response.body).toHaveProperty("stops");
    });

    it("should not expose sensitive broker data in public tracking", async () => {
      const broker = await createTestBroker({ 
        email: "sensitive@broker.com",
        name: "Sensitive Broker Name",
        emailVerified: true 
      });
      const load = await createTestLoad({ 
        brokerId: broker.id,
        customerRef: "PUBLIC-SAFE-001"
      });
      
      await createTestStop({ loadId: load.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load.id, type: "DELIVERY", sequence: 1 });
      
      const request = await getTestRequest();
      
      const response = await request
        .get(`/api/track/${load.trackingToken}`);
      
      expect(response.status).toBe(200);
      
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain("sensitive@broker.com");
      expect(responseText).not.toContain(broker.id);
    });

    it("should return 404 for invalid tracking token", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .get("/api/track/invalid_token_12345");
      
      expect(response.status).toBe(404);
    });

    it("should include origin and destination info", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const load = await createTestLoad({ 
        brokerId: broker.id,
        status: "PLANNED"
      });
      
      await createTestStop({ loadId: load.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load.id, type: "DELIVERY", sequence: 1 });
      
      const request = await getTestRequest();
      
      const response = await request
        .get(`/api/track/${load.trackingToken}`);
      
      expect(response.status).toBe(200);
      
      const pickup = response.body.stops.find((s: any) => s.type === "PICKUP");
      const delivery = response.body.stops.find((s: any) => s.type === "DELIVERY");
      
      expect(pickup).toBeDefined();
      expect(delivery).toBeDefined();
      expect(pickup).toHaveProperty("city");
      expect(delivery).toHaveProperty("city");
    });
  });
});
