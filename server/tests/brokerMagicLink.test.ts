import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { db } from "../db";
import { brokers, verificationTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Broker Magic Link Flow", () => {
  const testEmail = "broker-test@example.com";
  const testName = "Test Broker";
  let originalEnv: string | undefined;

  beforeAll(() => {
    originalEnv = process.env.AUTH_AUTO_CREATE_BROKER;
    process.env.AUTH_AUTO_CREATE_BROKER = 'true';
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.AUTH_AUTO_CREATE_BROKER = originalEnv;
    } else {
      delete process.env.AUTH_AUTO_CREATE_BROKER;
    }
  });

  describe("POST /api/brokers/ensure (with AUTH_AUTO_CREATE_BROKER=true)", () => {
    it("should create a new broker if none exists (legacy mode)", async () => {
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
      
      // May return 200 (email sent successfully) or 502 (email provider error in test mode)
      // Either way, the verification token should have been created
      expect([200, 502]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("ok", true);
      } else {
        expect(response.body).toHaveProperty("error", "EMAIL_SEND_FAILED");
      }
      
      // Verification token should be created regardless of email send status
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
