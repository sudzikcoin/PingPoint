import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { db } from "../db";
import { brokers, verificationTokens, brokerDevices } from "@shared/schema";
import { eq, and } from "drizzle-orm";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Trusted Device Login Flow", () => {
  const testEmail = "trusted-device-test@example.com";
  const testName = "Test Broker";

  describe("POST /api/brokers/login", () => {
    it("should return ACCOUNT_NOT_FOUND for unknown email", async () => {
      const request = await getTestRequest();

      const response = await request
        .post("/api/brokers/login")
        .send({ email: "unknown@example.com" });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("ACCOUNT_NOT_FOUND");
    });

    it("should return INVALID_EMAIL for malformed email", async () => {
      const request = await getTestRequest();

      const response = await request
        .post("/api/brokers/login")
        .send({ email: "not-an-email" });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_EMAIL");
    });

    it("should return EMAIL_NOT_VERIFIED for unverified broker", async () => {
      const request = await getTestRequest();

      await request
        .post("/api/brokers/ensure")
        .send({ email: testEmail, name: testName });

      const response = await request
        .post("/api/brokers/login")
        .send({ email: testEmail });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("EMAIL_NOT_VERIFIED");
    });

    it("should send magic link for verified broker on untrusted device", async () => {
      const request = await getTestRequest();

      const ensureRes = await request
        .post("/api/brokers/ensure")
        .send({ email: testEmail, name: testName });

      const brokerId = ensureRes.body.id;

      await db.update(brokers)
        .set({ emailVerified: true })
        .where(eq(brokers.id, brokerId));

      const response = await request
        .post("/api/brokers/login")
        .send({ email: testEmail });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe("MAGIC_LINK_SENT");

      const tokens = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.brokerId, brokerId));

      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should log in immediately on trusted device", async () => {
      const request = await getTestRequest();

      const ensureRes = await request
        .post("/api/brokers/ensure")
        .send({ email: testEmail, name: testName });

      const brokerId = ensureRes.body.id;

      await db.update(brokers)
        .set({ emailVerified: true })
        .where(eq(brokers.id, brokerId));

      const deviceId = "test-device-id-123";
      await db.insert(brokerDevices).values({
        brokerId,
        deviceId,
        userAgent: "test-agent",
      });

      const response = await request
        .post("/api/brokers/login")
        .set("Cookie", `pp_device=${deviceId}`)
        .send({ email: testEmail });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe("LOGIN_SUCCESS");
      expect(response.body.redirect).toBe("/app/loads");
    });
  });

  describe("Device Trust on Verification", () => {
    it("should create trusted device on magic link verification", async () => {
      const request = await getTestRequest();
      const uniqueEmail = `verify-device-test-${Date.now()}@example.com`;

      const ensureRes = await request
        .post("/api/brokers/ensure")
        .send({ email: uniqueEmail, name: testName });

      const brokerId = ensureRes.body.id;

      await request
        .post("/api/brokers/send-verification")
        .send({ brokerId });

      const [token] = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.brokerId, brokerId));

      const verifyRes = await request
        .post("/api/brokers/verify")
        .send({ token: token.token });

      expect(verifyRes.status).toBe(200);

      const setCookieHeader = verifyRes.headers["set-cookie"];
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader.some((c: string) => c.includes("pp_device="))).toBe(true);

      const devices = await db
        .select()
        .from(brokerDevices)
        .where(eq(brokerDevices.brokerId, brokerId));

      expect(devices.length).toBe(1);
    });

    it("should update lastUsedAt on subsequent trusted device login", async () => {
      const request = await getTestRequest();

      const ensureRes = await request
        .post("/api/brokers/ensure")
        .send({ email: testEmail, name: testName });

      const brokerId = ensureRes.body.id;

      await db.update(brokers)
        .set({ emailVerified: true })
        .where(eq(brokers.id, brokerId));

      const deviceId = "test-device-for-timestamp";
      const initialDate = new Date("2024-01-01");
      
      await db.insert(brokerDevices).values({
        brokerId,
        deviceId,
        userAgent: "test-agent",
        lastUsedAt: initialDate,
      });

      await request
        .post("/api/brokers/login")
        .set("Cookie", `pp_device=${deviceId}`)
        .send({ email: testEmail });

      const [device] = await db
        .select()
        .from(brokerDevices)
        .where(and(
          eq(brokerDevices.brokerId, brokerId),
          eq(brokerDevices.deviceId, deviceId)
        ));

      expect(device.lastUsedAt > initialDate).toBe(true);
    });
  });
});
