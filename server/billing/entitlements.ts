import { db } from "../db";
import { brokerEntitlements, brokerCredits } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export const FREE_INCLUDED_LOADS = 3;
export const PRO_INCLUDED_LOADS = 200;
export const CYCLE_DAYS = 30;

export interface LoadAllowanceResult {
  allowed: boolean;
  usedCredit?: boolean;
  reason?: string;
}

export interface EntitlementSummary {
  plan: string;
  cycleStartAt: Date;
  cycleEndAt: Date;
  includedLoads: number;
  loadsUsed: number;
  creditsBalance: number;
}

export async function ensureBrokerEntitlements(brokerId: string) {
  const now = new Date();
  const cycleEnd = new Date(now.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000);

  const [existingEntitlement] = await db
    .select()
    .from(brokerEntitlements)
    .where(eq(brokerEntitlements.brokerId, brokerId));

  let entitlement = existingEntitlement;

  if (!entitlement) {
    const [newEntitlement] = await db
      .insert(brokerEntitlements)
      .values({
        brokerId,
        plan: "FREE",
        cycleStartAt: now,
        cycleEndAt: cycleEnd,
        includedLoads: FREE_INCLUDED_LOADS,
        loadsUsed: 0,
        status: "active",
      })
      .returning();
    entitlement = newEntitlement;
  }

  const [existingCredits] = await db
    .select()
    .from(brokerCredits)
    .where(eq(brokerCredits.brokerId, brokerId));

  if (!existingCredits) {
    await db.insert(brokerCredits).values({
      brokerId,
      creditsBalance: 0,
    });
  }

  return entitlement;
}

export async function resetCycleIfNeeded(brokerId: string) {
  const [entitlement] = await db
    .select()
    .from(brokerEntitlements)
    .where(eq(brokerEntitlements.brokerId, brokerId));

  if (!entitlement) {
    return ensureBrokerEntitlements(brokerId);
  }

  const now = new Date();

  if (now > entitlement.cycleEndAt) {
    const newCycleEnd = new Date(now.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000);
    
    // When cycle expires, PRO users revert to FREE, FREE users stay FREE
    const [updated] = await db
      .update(brokerEntitlements)
      .set({
        cycleStartAt: now,
        cycleEndAt: newCycleEnd,
        includedLoads: FREE_INCLUDED_LOADS, // Always reset to FREE when cycle expires
        loadsUsed: 0,
        plan: "FREE",
        status: "active",
        updatedAt: now,
      })
      .where(eq(brokerEntitlements.brokerId, brokerId))
      .returning();

    console.log(`[Billing] Broker ${brokerId}: cycle expired, reset to FREE plan`);
    return updated;
  }

  return entitlement;
}

export async function checkAndConsumeLoadAllowance(brokerId: string): Promise<LoadAllowanceResult> {
  await ensureBrokerEntitlements(brokerId);
  const entitlement = await resetCycleIfNeeded(brokerId);

  if (entitlement.loadsUsed < entitlement.includedLoads) {
    const [updated] = await db
      .update(brokerEntitlements)
      .set({
        loadsUsed: sql`${brokerEntitlements.loadsUsed} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(brokerEntitlements.brokerId, brokerId))
      .returning();

    console.log(`[Billing] Broker ${brokerId}: used included load. Now ${updated.loadsUsed}/${updated.includedLoads}`);
    return { allowed: true };
  }

  const [credits] = await db
    .select()
    .from(brokerCredits)
    .where(eq(brokerCredits.brokerId, brokerId));

  if (credits && credits.creditsBalance > 0) {
    const [updatedCredits] = await db
      .update(brokerCredits)
      .set({
        creditsBalance: sql`${brokerCredits.creditsBalance} - 1`,
        updatedAt: new Date(),
      })
      .where(eq(brokerCredits.brokerId, brokerId))
      .returning();

    console.log(`[Billing] Broker ${brokerId}: used 1 credit. Remaining: ${updatedCredits.creditsBalance}`);
    return { allowed: true, usedCredit: true };
  }

  console.log(`[Billing] Broker ${brokerId}: BLOCKED - limit reached. ${entitlement.loadsUsed}/${entitlement.includedLoads}, credits: ${credits?.creditsBalance || 0}`);
  return { allowed: false, reason: "LOAD_LIMIT_REACHED" };
}

export async function rollbackLoadAllowance(brokerId: string, usedCredit: boolean) {
  if (usedCredit) {
    await db
      .update(brokerCredits)
      .set({
        creditsBalance: sql`${brokerCredits.creditsBalance} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(brokerCredits.brokerId, brokerId));
    console.log(`[Billing] Broker ${brokerId}: rolled back credit consumption`);
  } else {
    await db
      .update(brokerEntitlements)
      .set({
        loadsUsed: sql`GREATEST(${brokerEntitlements.loadsUsed} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(brokerEntitlements.brokerId, brokerId));
    console.log(`[Billing] Broker ${brokerId}: rolled back loadsUsed decrement`);
  }
}

export async function grantCredits(brokerId: string, credits: number, source?: string) {
  await ensureBrokerEntitlements(brokerId);

  const [updated] = await db
    .update(brokerCredits)
    .set({
      creditsBalance: sql`${brokerCredits.creditsBalance} + ${credits}`,
      updatedAt: new Date(),
    })
    .where(eq(brokerCredits.brokerId, brokerId))
    .returning();

  console.log(`[Billing] Broker ${brokerId}: granted ${credits} credits (source: ${source || 'unknown'}). New balance: ${updated.creditsBalance}`);
  return updated;
}

export async function getBillingSummary(brokerId: string): Promise<EntitlementSummary> {
  await ensureBrokerEntitlements(brokerId);
  const entitlement = await resetCycleIfNeeded(brokerId);

  const [credits] = await db
    .select()
    .from(brokerCredits)
    .where(eq(brokerCredits.brokerId, brokerId));

  return {
    plan: entitlement.plan,
    cycleStartAt: entitlement.cycleStartAt,
    cycleEndAt: entitlement.cycleEndAt,
    includedLoads: entitlement.includedLoads,
    loadsUsed: entitlement.loadsUsed,
    creditsBalance: credits?.creditsBalance || 0,
  };
}
