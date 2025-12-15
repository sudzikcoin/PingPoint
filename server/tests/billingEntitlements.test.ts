import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestRequest } from "./utils/testApp";
import { db } from "../db";
import { brokers, brokerEntitlements, brokerCredits } from "@shared/schema";
import { eq } from "drizzle-orm";
import { checkAndConsumeLoadAllowance, ensureBrokerEntitlements, grantCredits, FREE_INCLUDED_LOADS } from "../billing/entitlements";
import { createTestBroker } from "./utils/dbTestUtils";

vi.mock("../email", () => ({
  sendBrokerVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendDriverAppLink: vi.fn().mockResolvedValue(undefined),
}));

describe("Billing Entitlements", () => {
  describe("checkAndConsumeLoadAllowance", () => {
    it("should allow first 3 loads for new broker", async () => {
      const broker = await createTestBroker({ emailVerified: true });

      for (let i = 0; i < FREE_INCLUDED_LOADS; i++) {
        const result = await checkAndConsumeLoadAllowance(broker.id);
        expect(result.allowed).toBe(true);
        expect(result.usedCredit).toBeFalsy();
      }

      const [entitlement] = await db
        .select()
        .from(brokerEntitlements)
        .where(eq(brokerEntitlements.brokerId, broker.id));

      expect(entitlement.loadsUsed).toBe(FREE_INCLUDED_LOADS);
    });

    it("should block 4th load when no credits", async () => {
      const broker = await createTestBroker({ emailVerified: true });

      for (let i = 0; i < FREE_INCLUDED_LOADS; i++) {
        await checkAndConsumeLoadAllowance(broker.id);
      }

      const result = await checkAndConsumeLoadAllowance(broker.id);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("LOAD_LIMIT_REACHED");
    });

    it("should use credits after included loads exhausted", async () => {
      const broker = await createTestBroker({ emailVerified: true });

      for (let i = 0; i < FREE_INCLUDED_LOADS; i++) {
        await checkAndConsumeLoadAllowance(broker.id);
      }

      await grantCredits(broker.id, 2, "test");

      const result1 = await checkAndConsumeLoadAllowance(broker.id);
      expect(result1.allowed).toBe(true);
      expect(result1.usedCredit).toBe(true);

      const result2 = await checkAndConsumeLoadAllowance(broker.id);
      expect(result2.allowed).toBe(true);
      expect(result2.usedCredit).toBe(true);

      const result3 = await checkAndConsumeLoadAllowance(broker.id);
      expect(result3.allowed).toBe(false);
      expect(result3.reason).toBe("LOAD_LIMIT_REACHED");

      const [credits] = await db
        .select()
        .from(brokerCredits)
        .where(eq(brokerCredits.brokerId, broker.id));

      expect(credits.creditsBalance).toBe(0);
    });
  });

  describe("grantCredits", () => {
    it("should add credits to broker balance", async () => {
      const broker = await createTestBroker({ emailVerified: true });

      await ensureBrokerEntitlements(broker.id);
      await grantCredits(broker.id, 5, "test");

      const [credits] = await db
        .select()
        .from(brokerCredits)
        .where(eq(brokerCredits.brokerId, broker.id));

      expect(credits.creditsBalance).toBe(5);
    });

    it("should accumulate credits on multiple grants", async () => {
      const broker = await createTestBroker({ emailVerified: true });

      await ensureBrokerEntitlements(broker.id);
      await grantCredits(broker.id, 3, "test1");
      await grantCredits(broker.id, 2, "test2");

      const [credits] = await db
        .select()
        .from(brokerCredits)
        .where(eq(brokerCredits.brokerId, broker.id));

      expect(credits.creditsBalance).toBe(5);
    });
  });

  describe("POST /api/loads - billing enforcement", () => {
    it("should return 402 when load limit reached", async () => {
      const request = await getTestRequest();

      const broker = await createTestBroker({ emailVerified: true });

      for (let i = 0; i < FREE_INCLUDED_LOADS; i++) {
        const response = await request
          .post("/api/loads")
          .send({
            brokerEmail: broker.email,
            brokerName: broker.name,
            shipperName: `Shipper ${i}`,
            carrierName: `Carrier ${i}`,
            equipmentType: "DRY VAN",
            rateAmount: 1000,
            stops: [
              { type: "PICKUP", sequence: 1, name: "Origin", city: "Dallas", state: "TX" },
              { type: "DELIVERY", sequence: 2, name: "Dest", city: "Houston", state: "TX" },
            ],
          });

        expect(response.status).toBe(201);
      }

      const blockedResponse = await request
        .post("/api/loads")
        .send({
          brokerEmail: broker.email,
          brokerName: broker.name,
          shipperName: "Blocked Shipper",
          carrierName: "Blocked Carrier",
          equipmentType: "DRY VAN",
          rateAmount: 1000,
          stops: [
            { type: "PICKUP", sequence: 1, name: "Origin", city: "Dallas", state: "TX" },
            { type: "DELIVERY", sequence: 2, name: "Dest", city: "Houston", state: "TX" },
          ],
        });

      expect(blockedResponse.status).toBe(402);
      expect(blockedResponse.body.code).toBe("LOAD_LIMIT_REACHED");
    });
  });
});
