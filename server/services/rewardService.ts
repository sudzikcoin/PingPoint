import { db } from "../db";
import { driverRewardAccounts, driverRewardTransactions } from "@shared/schema";
import type { RewardEventType, DriverRewardAccount } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const ONCE_PER_LOAD_EVENTS: Set<RewardEventType> = new Set([
  'FIRST_LOCATION_SHARE',
  'LOAD_ON_TIME',
]);

const POINTS_MAP: Record<RewardEventType, number> = {
  FIRST_LOCATION_SHARE: 10,
  ARRIVE_PICKUP: 20,
  DEPART_PICKUP: 20,
  ARRIVE_DELIVERY: 20,
  DEPART_DELIVERY: 30,
  LOAD_ON_TIME: 50,
};

const DESCRIPTION_MAP: Record<RewardEventType, string> = {
  FIRST_LOCATION_SHARE: "First location share",
  ARRIVE_PICKUP: "Arrive at pickup",
  DEPART_PICKUP: "Depart from pickup",
  ARRIVE_DELIVERY: "Arrive at delivery",
  DEPART_DELIVERY: "Depart from delivery",
  LOAD_ON_TIME: "Load delivered on time",
};

export interface AwardPointsParams {
  loadId?: string | null;
  driverId?: string | null;
  driverToken?: string | null;
  eventType: RewardEventType;
}

export interface AwardPointsResult {
  pointsAwarded: number;
  newBalance: number;
  eventType: RewardEventType;
}

async function findOrCreateAccount(
  driverId: string | null | undefined,
  driverToken: string | null | undefined
): Promise<DriverRewardAccount | null> {
  if (driverId) {
    const [existing] = await db
      .select()
      .from(driverRewardAccounts)
      .where(eq(driverRewardAccounts.driverId, driverId));

    if (existing) return existing;

    const [created] = await db
      .insert(driverRewardAccounts)
      .values({ driverId, driverToken: null })
      .returning();
    return created;
  }

  if (driverToken) {
    const [existing] = await db
      .select()
      .from(driverRewardAccounts)
      .where(eq(driverRewardAccounts.driverToken, driverToken));

    if (existing) return existing;

    const [created] = await db
      .insert(driverRewardAccounts)
      .values({ driverId: null, driverToken })
      .returning();
    return created;
  }

  return null;
}

export async function awardPointsForEvent(
  params: AwardPointsParams
): Promise<AwardPointsResult | null> {
  try {
    const { loadId, driverId, driverToken, eventType } = params;

    const account = await findOrCreateAccount(driverId, driverToken);
    if (!account) {
      console.log("[Reward] No account identifier provided, skipping reward");
      return null;
    }

    // Idempotency check for once-per-load events
    if (ONCE_PER_LOAD_EVENTS.has(eventType) && loadId) {
      const [existing] = await db
        .select()
        .from(driverRewardTransactions)
        .where(
          and(
            eq(driverRewardTransactions.rewardAccountId, account.id),
            eq(driverRewardTransactions.loadId, loadId),
            eq(driverRewardTransactions.eventType, eventType)
          )
        );

      if (existing) {
        console.log(
          `[Reward] Skipping duplicate ${eventType} for load ${loadId}, already awarded`
        );
        return null;
      }
    }

    const points = POINTS_MAP[eventType];
    const description = DESCRIPTION_MAP[eventType];

    // Use onConflictDoNothing for atomic idempotency on once-per-load events
    const insertResult = await db.insert(driverRewardTransactions).values({
      rewardAccountId: account.id,
      loadId: loadId || null,
      eventType,
      points,
      description,
    }).onConflictDoNothing().returning();

    // If no row was inserted (conflict), skip the balance update
    if (insertResult.length === 0) {
      console.log(
        `[Reward] Skipping duplicate ${eventType} for load ${loadId} (unique constraint)`
      );
      return null;
    }

    const [updated] = await db
      .update(driverRewardAccounts)
      .set({
        balancePoints: sql`${driverRewardAccounts.balancePoints} + ${points}`,
        updatedAt: new Date(),
      })
      .where(eq(driverRewardAccounts.id, account.id))
      .returning();

    console.log(
      `[Reward] Awarded ${points} points for ${eventType} to account ${account.id}, new balance: ${updated.balancePoints}`
    );

    return {
      pointsAwarded: points,
      newBalance: updated.balancePoints,
      eventType,
    };
  } catch (error) {
    console.error("[Reward] Error awarding points:", error);
    return null;
  }
}

export async function getRewardBalance(
  driverId: string | null | undefined,
  driverToken: string | null | undefined
): Promise<number> {
  try {
    if (driverId) {
      const [account] = await db
        .select()
        .from(driverRewardAccounts)
        .where(eq(driverRewardAccounts.driverId, driverId));
      return account?.balancePoints ?? 0;
    }

    if (driverToken) {
      const [account] = await db
        .select()
        .from(driverRewardAccounts)
        .where(eq(driverRewardAccounts.driverToken, driverToken));
      return account?.balancePoints ?? 0;
    }

    return 0;
  } catch (error) {
    console.error("[Reward] Error getting balance:", error);
    return 0;
  }
}

export async function getRewardHistory(
  driverId: string | null | undefined,
  driverToken: string | null | undefined,
  limit: number = 20
) {
  try {
    let accountId: string | null = null;

    if (driverId) {
      const [account] = await db
        .select()
        .from(driverRewardAccounts)
        .where(eq(driverRewardAccounts.driverId, driverId));
      accountId = account?.id ?? null;
    } else if (driverToken) {
      const [account] = await db
        .select()
        .from(driverRewardAccounts)
        .where(eq(driverRewardAccounts.driverToken, driverToken));
      accountId = account?.id ?? null;
    }

    if (!accountId) return [];

    return await db
      .select()
      .from(driverRewardTransactions)
      .where(eq(driverRewardTransactions.rewardAccountId, accountId))
      .orderBy(sql`${driverRewardTransactions.createdAt} DESC`)
      .limit(limit);
  } catch (error) {
    console.error("[Reward] Error getting history:", error);
    return [];
  }
}
