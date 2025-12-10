import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { db } from "../db";
import { brokers, verificationTokens, loads } from "@shared/schema";
import { eq } from "drizzle-orm";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Broker Magic Link Flow", () => {
  const testEmail = "broker-test@example.com";
  const testName = "Test Broker";

  describe("POST /api/brokers/ensure", () => {
    it("should create a new broker if none exists", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/ensure")
        .send({ email: testEmail, name: testName });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body.email).toBe(testEmail);
      expect(response.body.name).toBe(testName);
      expect(response.body.emailVerified).toBe(false);
    });

    it("should return existing broker if email already exists", async () => {
      const request = await getTestRequest();
      
      const response1 = await request
        .post("/api/brokers/ensure")
        .send({ email: testEmail, name: testName });
      
      const response2 = await request
        .post("/api/brokers/ensure")
        .send({ email: testEmail, name: "Different Name" });
      
      expect(response1.body.id).toBe(response2.body.id);
    });

    it("should normalize email to lowercase", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/ensure")
        .send({ email: "UPPERCASE@EXAMPLE.COM", name: testName });
      
      expect(response.status).toBe(200);
      expect(response.body.email).toBe("uppercase@example.com");
    });

    it("should reject request without email", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/ensure")
        .send({ name: testName });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Email is required");
    });
  });

  describe("POST /api/brokers/send-verification", () => {
    it("should create a verification token for broker", async () => {
      const request = await getTestRequest();
      
      const ensureRes = await request
        .post("/api/brokers/ensure")
        .send({ email: testEmail, name: testName });
      
      const brokerId = ensureRes.body.id;
      
      const response = await request
        .post("/api/brokers/send-verification")
        .send({ brokerId });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("ok", true);
      
      const tokens = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.brokerId, brokerId));
      
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].used).toBe(false);
    });

    it("should reject request without brokerId", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/send-verification")
        .send({});
      
      expect(response.status).toBe(400);
    });
  });
});
