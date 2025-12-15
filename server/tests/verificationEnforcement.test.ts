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
    it("should return 403 EMAIL_NOT_VERIFIED for unverified broker trying second load", async () => {
      const broker = await createTestBroker({ emailVerified: false });
      
      const request = await getTestRequest();
      
      // First load creation should succeed
      const firstLoadResponse = await request
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
      
      expect(firstLoadResponse.status).toBe(201);
      
      // Get cookie from first request
      const cookies = firstLoadResponse.headers["set-cookie"];
      
      // Second load creation should be blocked - unverified with existing load
      const secondLoadResponse = await request
        .post("/api/loads")
        .set("Cookie", cookies)
        .send({
          brokerEmail: broker.email,
          brokerName: "Test Broker",
          driverPhone: "+15551234568",
          shipperName: "Another Shipper",
          carrierName: "Another Carrier",
          equipmentType: "FLATBED",
          rateAmount: 2000,
          stops: [
            { type: "PICKUP", name: "Origin2", city: "Austin", state: "TX" },
            { type: "DELIVERY", name: "Destination2", city: "Phoenix", state: "AZ" }
          ]
        });
      
      expect(secondLoadResponse.status).toBe(403);
      expect(secondLoadResponse.body.code).toBe("EMAIL_NOT_VERIFIED");
      expect(secondLoadResponse.body.email).toBe(broker.email);
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

    it("should return 400 for request without brokerEmail", async () => {
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
      
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("BROKER_EMAIL_REQUIRED");
    });

    it("should allow first load for existing unverified broker with no loads and send verification email", async () => {
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
      
      // Should allow first load creation
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("loadNumber");
      // Should send verification email
      expect(mockSendEmail).toHaveBeenCalled();
    });

    it("should not update existing broker profile during load creation via email lookup", async () => {
      const broker = await createTestBroker({ emailVerified: false, name: "Original Name" });
      
      const request = await getTestRequest();
      
      // Create first load - should succeed but NOT change broker profile
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
          stops: [
            { type: "PICKUP", name: "Origin", city: "Dallas", state: "TX" },
            { type: "DELIVERY", name: "Destination", city: "Houston", state: "TX" }
          ]
        });
      
      // Should create load successfully
      expect(response.status).toBe(201);
      
      // TODO: Add assertion that broker profile was not changed
      // (would require fetching broker from DB and checking name/phone)
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
