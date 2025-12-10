import { describe, it, expect, vi } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { createTestBroker, createTestLoad, createTestStop, createTestVerificationToken } from "./utils/dbTestUtils";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Broker Loads Listing", () => {
  describe("GET /api/loads", () => {
    it("should return loads for authenticated broker", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const load1 = await createTestLoad({ brokerId: broker.id, customerRef: "CUST-001" });
      const load2 = await createTestLoad({ brokerId: broker.id, customerRef: "CUST-002" });
      
      await createTestStop({ loadId: load1.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load1.id, type: "DELIVERY", sequence: 1 });
      await createTestStop({ loadId: load2.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load2.id, type: "DELIVERY", sequence: 1 });
      
      const verificationToken = await createTestVerificationToken({ brokerId: broker.id });
      
      const request = await getTestRequest();
      
      const verifyResponse = await request
        .post("/api/brokers/verify")
        .send({ token: verificationToken.token });
      
      const cookies = verifyResponse.headers["set-cookie"];
      
      const response = await request
        .get("/api/loads")
        .set("Cookie", cookies);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("items");
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBe(2);
      expect(response.body.total).toBe(2);
    });

    it("should return 401 for unauthenticated request", async () => {
      const request = await getTestRequest();
      
      const response = await request.get("/api/loads");
      
      expect(response.status).toBe(401);
    });

    it("should only return loads belonging to the authenticated broker", async () => {
      const broker1 = await createTestBroker({ email: "broker1@example.com", emailVerified: true });
      const broker2 = await createTestBroker({ email: "broker2@example.com", emailVerified: true });
      
      const load1 = await createTestLoad({ brokerId: broker1.id, customerRef: "BROKER1-LOAD" });
      await createTestLoad({ brokerId: broker2.id, customerRef: "BROKER2-LOAD" });
      
      await createTestStop({ loadId: load1.id, type: "PICKUP", sequence: 0 });
      await createTestStop({ loadId: load1.id, type: "DELIVERY", sequence: 1 });
      
      const token = await createTestVerificationToken({ brokerId: broker1.id });
      
      const request = await getTestRequest();
      
      const verifyResponse = await request
        .post("/api/brokers/verify")
        .send({ token: token.token });
      
      const cookies = verifyResponse.headers["set-cookie"];
      
      const response = await request
        .get("/api/loads")
        .set("Cookie", cookies);
      
      expect(response.status).toBe(200);
      expect(response.body.items.length).toBe(1);
    });
  });
});
