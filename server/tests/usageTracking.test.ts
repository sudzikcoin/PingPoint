import { describe, it, expect, beforeEach } from "vitest";
import { resetDatabase, createTestBroker } from "./utils/dbTestUtils";
import { ensureUsageRow, rollCycleIfNeeded, incrementLoadsCreated, getUsageSummary } from "../billing/usage";
import { db } from "../db";
import { brokerUsage } from "@shared/schema";
import { eq } from "drizzle-orm";

describe("Usage Tracking", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe("ensureUsageRow", () => {
    it("should create a new usage row if none exists", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      
      const row = await ensureUsageRow(broker.id);
      
      expect(row).toBeDefined();
      expect(row.brokerId).toBe(broker.id);
      expect(row.loadsCreated).toBe(0);
      expect(row.cycleStartAt).toBeDefined();
      expect(row.cycleEndAt).toBeDefined();
    });

    it("should return existing row if one exists", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      
      const row1 = await ensureUsageRow(broker.id);
      const row2 = await ensureUsageRow(broker.id);
      
      expect(row1.id).toBe(row2.id);
    });
  });

  describe("incrementLoadsCreated", () => {
    it("should increment the loads created counter", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      
      await ensureUsageRow(broker.id);
      await incrementLoadsCreated(broker.id);
      
      const [row] = await db.select().from(brokerUsage).where(eq(brokerUsage.brokerId, broker.id));
      expect(row.loadsCreated).toBe(1);
    });

    it("should increment multiple times correctly", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      
      await ensureUsageRow(broker.id);
      await incrementLoadsCreated(broker.id);
      await incrementLoadsCreated(broker.id);
      await incrementLoadsCreated(broker.id);
      
      const [row] = await db.select().from(brokerUsage).where(eq(brokerUsage.brokerId, broker.id));
      expect(row.loadsCreated).toBe(3);
    });

    it("should create row if not exists before incrementing", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      
      await incrementLoadsCreated(broker.id);
      
      const [row] = await db.select().from(brokerUsage).where(eq(brokerUsage.brokerId, broker.id));
      expect(row).toBeDefined();
      expect(row.loadsCreated).toBe(1);
    });
  });

  describe("rollCycleIfNeeded", () => {
    it("should not roll cycle if still within period", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      
      const row1 = await ensureUsageRow(broker.id);
      await incrementLoadsCreated(broker.id);
      
      const row2 = await rollCycleIfNeeded(broker.id);
      
      expect(row2.cycleStartAt.getTime()).toBe(row1.cycleStartAt.getTime());
      expect(row2.loadsCreated).toBe(1);
    });

    it("should roll cycle if expired", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      
      await ensureUsageRow(broker.id);
      await incrementLoadsCreated(broker.id);
      
      const pastDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      await db.update(brokerUsage)
        .set({ cycleEndAt: pastDate })
        .where(eq(brokerUsage.brokerId, broker.id));
      
      const row = await rollCycleIfNeeded(broker.id);
      
      expect(row.loadsCreated).toBe(0);
      expect(row.cycleStartAt.getTime()).toBeGreaterThan(pastDate.getTime());
    });
  });

  describe("getUsageSummary", () => {
    it("should return usage summary", async () => {
      const broker = await createTestBroker({ emailVerified: true });
      
      await ensureUsageRow(broker.id);
      await incrementLoadsCreated(broker.id);
      await incrementLoadsCreated(broker.id);
      
      const summary = await getUsageSummary(broker.id);
      
      expect(summary.loadsCreated).toBe(2);
      expect(summary.cycleStartAt).toBeDefined();
      expect(summary.cycleEndAt).toBeDefined();
    });
  });
});
