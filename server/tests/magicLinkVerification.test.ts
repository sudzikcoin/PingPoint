import { describe, it, expect, vi } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { createTestBroker, createTestVerificationToken } from "./utils/dbTestUtils";
import { db } from "../db";
import { verificationTokens, brokers } from "@shared/schema";
import { eq } from "drizzle-orm";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Magic Link Verification", () => {
  describe("POST /api/brokers/verify", () => {
    it("should verify a valid token and mark broker as verified", async () => {
      const broker = await createTestBroker({ emailVerified: false });
      const verificationToken = await createTestVerificationToken({ brokerId: broker.id });
      
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/verify")
        .send({ token: verificationToken.token });
      
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      
      const updatedToken = await db
        .select()
        .from(verificationTokens)
        .where(eq(verificationTokens.id, verificationToken.id));
      
      expect(updatedToken[0].used).toBe(true);
      
      const updatedBroker = await db
        .select()
        .from(brokers)
        .where(eq(brokers.id, broker.id));
      
      expect(updatedBroker[0].emailVerified).toBe(true);
    });

    it("should reject already-used token", async () => {
      const broker = await createTestBroker({ emailVerified: false });
      const verificationToken = await createTestVerificationToken({ 
        brokerId: broker.id, 
        used: true 
      });
      
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/verify")
        .send({ token: verificationToken.token });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain("invalid or expired");
    });

    it("should reject expired token", async () => {
      const broker = await createTestBroker({ emailVerified: false });
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const verificationToken = await createTestVerificationToken({ 
        brokerId: broker.id, 
        expiresAt: expiredDate 
      });
      
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/verify")
        .send({ token: verificationToken.token });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain("invalid or expired");
    });

    it("should reject non-existent token", async () => {
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/verify")
        .send({ token: "nonexistent-token-12345" });
      
      expect(response.status).toBe(400);
    });

    it("should set broker session cookie on successful verification", async () => {
      const broker = await createTestBroker({ emailVerified: false });
      const verificationToken = await createTestVerificationToken({ brokerId: broker.id });
      
      const request = await getTestRequest();
      
      const response = await request
        .post("/api/brokers/verify")
        .send({ token: verificationToken.token });
      
      expect(response.status).toBe(200);
      
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes("pingpoint_broker_session"))).toBe(true);
    });
  });
});
