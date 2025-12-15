import { db } from "../db";
import { brokerUsage } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const CYCLE_DAYS = 30;

export async function ensureUsageRow(brokerId: string) {
  const [existing] = await db
    .select()
    .from(brokerUsage)
    .where(eq(brokerUsage.brokerId, brokerId));

  if (existing) {
    return existing;
  }

  const now = new Date();
  const cycleEnd = new Date(now.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000);

  const [newRow] = await db
    .insert(brokerUsage)
    .values({
      brokerId,
      cycleStartAt: now,
      cycleEndAt: cycleEnd,
      loadsCreated: 0,
    })
    .returning();

  return newRow;
}

export async function rollCycleIfNeeded(brokerId: string) {
  const row = await ensureUsageRow(brokerId);
  const now = new Date();

  if (now > row.cycleEndAt) {
    const newCycleEnd = new Date(now.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000);

    const [updated] = await db
      .update(brokerUsage)
      .set({
        cycleStartAt: now,
        cycleEndAt: newCycleEnd,
        loadsCreated: 0,
        updatedAt: now,
      })
      .where(eq(brokerUsage.brokerId, brokerId))
      .returning();

    console.log(`[Usage] Broker ${brokerId}: cycle rolled. New cycle ends ${newCycleEnd.toISOString()}`);
    return updated;
  }

  return row;
}

export async function incrementLoadsCreated(brokerId: string) {
  await rollCycleIfNeeded(brokerId);

  const [updated] = await db
    .update(brokerUsage)
    .set({
      loadsCreated: sql`${brokerUsage.loadsCreated} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(brokerUsage.brokerId, brokerId))
    .returning();

  console.log(`[Usage] Broker ${brokerId}: loadsCreated incremented to ${updated.loadsCreated}`);
  return updated;
}

export async function getUsageSummary(brokerId: string) {
  const row = await rollCycleIfNeeded(brokerId);

  return {
    cycleStartAt: row.cycleStartAt,
    cycleEndAt: row.cycleEndAt,
    loadsCreated: row.loadsCreated,
  };
}
