import { describe, it, expect, vi } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { createTestBroker, createTestVerificationToken } from "./utils/dbTestUtils";
import * as email from "../email";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Verification Enforcement", () => {
  describe("POST /api/loads - Unverified brokers blocked", () => {
    it("should return 403 EMAIL_NOT_VERIFIED for unverified broker with existing session", async () => {
      const broker = await createTestBroker({ emailVerified: false });
      
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/loads")
        .send({
          brokerEmail: broker.email,
          brokerName: "Test Broker",
          driverPhone: "+15551234567",
          shipperName: "Test Shipper",
          carrierName: "Test Carrier",
          equipmentType: "DRY VAN",
          rateAmount: 1500,
          stops: [
            { type: "PICKUP", name: "Origin", city: "Dallas", state: "TX" },
            { type: "DELIVERY", name: "Destination", city: "Houston", state: "TX" }
          ]
        });
      
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
      expect(response.body.email).toBe(broker.email);
    });

    it("should allow load creation for verified broker", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      const verificationToken = await createTestVerificationToken({ brokerId: broker.id });
      
      const request = await getTestRequest();
      
      const verifyResponse = await request
        .post("/api/brokers/verify")
        .send({ token: verificationToken.token });
      
      const cookies = verifyResponse.headers["set-cookie"];
      
      const response = await request
        .post("/api/loads")
        .set("Cookie", cookies)
        .send({
          brokerEmail: broker.email,
          brokerName: "Test Broker",
          driverPhone: "+15551234567",
          shipperName: "Test Shipper",
          carrierName: "Test Carrier",
          equipmentType: "DRY VAN",
          rateAmount: 1500,
          stops: [
            { type: "PICKUP", name: "Origin", city: "Dallas", state: "TX" },
            { type: "DELIVERY", name: "Destination", city: "Houston", state: "TX" }
          ]
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("loadNumber");
    });

    it("should create first load for new broker and send verification email", async () => {
      const request = await getTestRequest();
      const testEmail = `newbroker-${Date.now()}@example.com`;
      
      const mockSendEmail = vi.spyOn(email, 'sendBrokerVerificationEmail');
      mockSendEmail.mockClear();
      
      const response = await request
        .post("/api/loads")
        .send({
          brokerEmail: testEmail,
          brokerName: "New Broker",
          driverPhone: "+15551234567",
          shipperName: "Test Shipper",
          carrierName: "Test Carrier",
          equipmentType: "DRY VAN",
          rateAmount: 1500,
          stops: [
            { type: "PICKUP", name: "Origin", city: "Dallas", state: "TX" },
            { type: "DELIVERY", name: "Destination", city: "Houston", state: "TX" }
          ]
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("loadNumber");
      expect(mockSendEmail).toHaveBeenCalled();
    });

    it("should return 401 for unauthenticated request without brokerEmail", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/loads")
        .send({
          brokerName: "Test Broker",
          driverPhone: "+15551234567",
          shipperName: "Test Shipper",
          carrierName: "Test Carrier",
          equipmentType: "DRY VAN",
          rateAmount: 1500,
        });
      
      expect(response.status).toBe(401);
    });

    it("should not send verification email for existing unverified broker via email lookup", async () => {
      const broker = await createTestBroker({ emailVerified: false });
      
      const mockSendEmail = vi.spyOn(email, 'sendBrokerVerificationEmail');
      mockSendEmail.mockClear();
      
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/loads")
        .send({
          brokerEmail: broker.email,
          brokerName: "Test Broker",
          driverPhone: "+15551234567",
          shipperName: "Test Shipper",
          carrierName: "Test Carrier",
          equipmentType: "DRY VAN",
          rateAmount: 1500,
          stops: [
            { type: "PICKUP", name: "Origin", city: "Dallas", state: "TX" },
            { type: "DELIVERY", name: "Destination", city: "Houston", state: "TX" }
          ]
        });
      
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("should not update profile for unauthenticated callers", async () => {
      const broker = await createTestBroker({ emailVerified: false, name: "Original Name" });
      
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/loads")
        .send({
          brokerEmail: broker.email,
          brokerName: "Changed Name",
          brokerPhone: "+15559999999",
          driverPhone: "+15551234567",
          shipperName: "Test Shipper",
          carrierName: "Test Carrier",
          equipmentType: "DRY VAN",
          rateAmount: 1500,
        });
      
      expect(response.status).toBe(403);
    });
  });

  describe("PUT /api/broker/profile - Email change triggers re-verification", () => {
    it("should reset emailVerified when email is changed", async () => {
      const broker = await createTestBroker({ email: "original@example.com", emailVerified: true });
      const verificationToken = await createTestVerificationToken({ brokerId: broker.id });
      
      const request = await getTestRequest();
      
      const verifyResponse = await request
        .post("/api/brokers/verify")
        .send({ token: verificationToken.token });
      
      const cookies = verifyResponse.headers["set-cookie"];
      
      const response = await request
        .put("/api/broker/profile")
        .set("Cookie", cookies)
        .send({
          name: broker.name,
          email: "newemail@example.com",
        });
      
      expect(response.status).toBe(200);
      expect(response.body.email).toBe("newemail@example.com");
      expect(response.body.emailVerified).toBe(false);
      expect(response.body.emailChanged).toBe(true);
    });

    it("should not reset emailVerified when email is unchanged", async () => {
      const broker = await createTestBroker({ email: "same@example.com", emailVerified: true });
      const verificationToken = await createTestVerificationToken({ brokerId: broker.id });
      
      const request = await getTestRequest();
      
      const verifyResponse = await request
        .post("/api/brokers/verify")
        .send({ token: verificationToken.token });
      
      const cookies = verifyResponse.headers["set-cookie"];
      
      const response = await request
        .put("/api/broker/profile")
        .set("Cookie", cookies)
        .send({
          name: "Updated Name",
          email: "same@example.com",
        });
      
      expect(response.status).toBe(200);
      expect(response.body.emailVerified).toBe(true);
      expect(response.body.emailChanged).toBe(false);
    });

    it("should reject email change if email is already in use", async () => {
      const broker1 = await createTestBroker({ email: "broker1-unique@example.com", emailVerified: true });
      await createTestBroker({ email: "taken-email@example.com", emailVerified: true });
      const verificationToken = await createTestVerificationToken({ brokerId: broker1.id });
      
      const request = await getTestRequest();
      
      const verifyResponse = await request
        .post("/api/brokers/verify")
        .send({ token: verificationToken.token });
      
      const cookies = verifyResponse.headers["set-cookie"];
      
      const response = await request
        .put("/api/broker/profile")
        .set("Cookie", cookies)
        .send({
          name: broker1.name,
          email: "taken-email@example.com",
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Email is already in use");
    });
  });
});
