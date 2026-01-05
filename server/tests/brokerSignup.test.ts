import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { db } from "../db";
import { brokers, verificationTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

describe("Broker Signup and Login Flow", () => {
  const testName = "Signup Test Broker";
  let originalEnv: string | undefined;
  let createdBrokerId: string;
  let createdBrokerEmail: string;

  beforeAll(() => {
    originalEnv = process.env.AUTH_AUTO_CREATE_BROKER;
    delete process.env.AUTH_AUTO_CREATE_BROKER;
    createdBrokerEmail = uniqueEmail("signup-main");
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.AUTH_AUTO_CREATE_BROKER = originalEnv;
    }
  });

  describe("POST /api/brokers/signup", () => {
    it("should create a new broker account", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/signup")
        .send({ email: createdBrokerEmail, name: testName });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.email).toBe(createdBrokerEmail);
      expect(response.body.name).toBe(testName);
      expect(response.body.emailVerified).toBe(false);
      expect(response.body.code).toBe("ACCOUNT_CREATED");
      
      createdBrokerId = response.body.id;
    });

    it("should reject if email already exists", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/signup")
        .send({ email: createdBrokerEmail, name: "Different Name" });
      
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("ACCOUNT_ALREADY_EXISTS");
    });

    it("should reject request without email", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/signup")
        .send({ name: testName });
      
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("EMAIL_REQUIRED");
    });

    it("should reject invalid email format", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/signup")
        .send({ email: "not-an-email", name: testName });
      
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_EMAIL");
    });

    it("should have created verification token on signup", async () => {
      const tokens = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.brokerId, createdBrokerId));
      
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].used).toBe(false);
    });
  });

  describe("POST /api/brokers/login", () => {
    it("should return ACCOUNT_NOT_FOUND for unknown email", async () => {
      const request = await getTestRequest();
      const email = uniqueEmail("unknown");
      
      const response = await request
        .post("/api/brokers/login")
        .send({ email });
      
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("should return EMAIL_NOT_VERIFIED for unverified account", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/login")
        .send({ email: createdBrokerEmail });
      
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
    });

    it("should reject invalid email format", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/login")
        .send({ email: "not-an-email" });
      
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_EMAIL");
    });
  });

  describe("POST /api/brokers/ensure (with AUTH_AUTO_CREATE_BROKER=false)", () => {
    it("should return 404 for unknown email when auto-create is disabled", async () => {
      const request = await getTestRequest();
      const email = uniqueEmail("ensure-unknown");
      
      const response = await request
        .post("/api/brokers/ensure")
        .send({ email, name: testName });
      
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("should return existing broker if email exists", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/ensure")
        .send({ email: createdBrokerEmail, name: "Different Name" });
      
      expect(response.status).toBe(200);
      expect(response.body.email).toBe(createdBrokerEmail);
    });
  });
});
