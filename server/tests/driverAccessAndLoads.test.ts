import { describe, it, expect, vi } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { createTestBroker, createTestDriver, createTestLoad, createTestStop } from "./utils/dbTestUtils";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Driver Access and Loads", () => {
  describe("GET /api/driver/:driverToken", () => {
    it("should return load details for valid driver token", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ 
        brokerId: broker.id, 
        driverId: driver.id,
        customerRef: "CUSTOMER-REF-001" 
      });
      
      await createTestStop({ loadId: load.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load.id, type: "DELIVERY", sequence: 1 });
      
      const request = await getTestRequest();
      
      const response = await request
        .get(`/api/driver/${load.driverToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("customerRef", "CUSTOMER-REF-001");
      expect(response.body).toHaveProperty("stops");
      expect(Array.isArray(response.body.stops)).toBe(true);
    });

    it("should not expose internal load number, use customerRef instead", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ 
        brokerId: broker.id, 
        driverId: driver.id,
        customerRef: "VISIBLE-REF-123" 
      });
      
      await createTestStop({ loadId: load.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load.id, type: "DELIVERY", sequence: 1 });
      
      const request = await getTestRequest();
      
      const response = await request
        .get(`/api/driver/${load.driverToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.customerRef).toBe("VISIBLE-REF-123");
    });

    it("should return 404 for invalid driver token", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .get("/api/driver/invalid_token_12345");
      
      expect(response.status).toBe(404);
    });

    it("should include stop details with status", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const driver = await createTestDriver();
      const load = await createTestLoad({ 
        brokerId: broker.id, 
        driverId: driver.id,
        customerRef: "STOP-TEST-001" 
      });
      
      await createTestStop({ loadId: load.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load.id, type: "DELIVERY", sequence: 1 });
      
      const request = await getTestRequest();
      
      const response = await request
        .get(`/api/driver/${load.driverToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.stops.length).toBe(2);
      
      const pickup = response.body.stops.find((s: any) => s.type === "PICKUP");
      const delivery = response.body.stops.find((s: any) => s.type === "DELIVERY");
      
      expect(pickup).toBeDefined();
      expect(delivery).toBeDefined();
    });
  });
});
