import { db } from "../db";
import {
  drivers,
  loads,
  truckTokens,
  trackingDiagnostics,
} from "@shared/schema";
import { and, eq, isNotNull, isNull, inArray, lt, or, desc } from "drizzle-orm";
import { sendDataPush, isFcmEnabled } from "../services/fcmService";

const TICK_INTERVAL_MS = 60 * 1000;
// Smart-push staleness threshold. Transistorsoft intentionally goes
// quiet on stationary state, so a tight 2-minute window from the
// expo-location era would push every parked truck constantly. 10 min
// is comfortably past the SDK's stop-detection settle.
const STALENESS_THRESHOLD_MS = 10 * 60 * 1000;
// Per-truck throttle: even if stale, never push the same truck more
// than once per this window. Prevents Firebase deprioritization.
const PER_TRUCK_THROTTLE_MS = 5 * 60 * 1000;
const lastPushAt = new Map<string, number>();
const ACTIVE_LOAD_STATUSES = [
  "PLANNED",
  "IN_TRANSIT",
  "AT_PICKUP",
  "AT_DELIVERY",
];

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;
let lastRunTime: Date | null = null;
let lastSuccessCount = 0;
let lastFailureCount = 0;
let lastInvalidatedCount = 0;
let lastSkippedFreshCount = 0;

export interface FcmPingTriggerStatus {
  enabled: boolean;
  running: boolean;
  lastRun: string | null;
  lastSuccessCount: number;
  lastFailureCount: number;
  lastInvalidatedCount: number;
  lastSkippedFreshCount: number;
}

export function getFcmPingTriggerStatus(): FcmPingTriggerStatus {
  return {
    enabled: intervalId !== null,
    running: isRunning,
    lastRun: lastRunTime?.toISOString() ?? null,
    lastSuccessCount,
    lastFailureCount,
    lastInvalidatedCount,
    lastSkippedFreshCount,
  };
}

async function tick(): Promise<void> {
  if (isRunning) {
    console.debug("[FCMPing] previous tick still running, skipping");
    return;
  }
  if (!isFcmEnabled()) return;

  isRunning = true;
  lastRunTime = new Date();
  lastSuccessCount = 0;
  lastFailureCount = 0;
  lastInvalidatedCount = 0;
  lastSkippedFreshCount = 0;

  try {
    const cutoff = new Date(Date.now() - STALENESS_THRESHOLD_MS);

    // Truck tokens with FCM + an active load whose last_seen heartbeat is
    // either missing or older than the staleness threshold. The APK pings
    // every 2 minutes on its own — we only nudge it when we haven't heard
    // from it in that window.
    const rows = await db
      .selectDistinct({
        truckTokenId: truckTokens.id,
        truckNumber: truckTokens.truckNumber,
        fcmToken: truckTokens.fcmToken,
        lastSeen: truckTokens.lastSeen,
      })
      .from(truckTokens)
      .innerJoin(loads, eq(loads.driverId, truckTokens.driverId))
      .where(
        and(
          isNotNull(truckTokens.fcmToken),
          isNotNull(truckTokens.driverId),
          inArray(loads.status, ACTIVE_LOAD_STATUSES),
          or(
            isNull(truckTokens.lastSeen),
            lt(truckTokens.lastSeen, cutoff),
          ),
        ),
      );

    // Count fresh trucks for visibility (not pushed because heart-beat is recent).
    const freshRows = await db
      .selectDistinct({ truckTokenId: truckTokens.id })
      .from(truckTokens)
      .innerJoin(loads, eq(loads.driverId, truckTokens.driverId))
      .where(
        and(
          isNotNull(truckTokens.fcmToken),
          isNotNull(truckTokens.driverId),
          inArray(loads.status, ACTIVE_LOAD_STATUSES),
        ),
      );
    lastSkippedFreshCount = Math.max(0, freshRows.length - rows.length);

    if (rows.length === 0) {
      if (freshRows.length > 0) {
        console.log(
          `[SmartPush] all ${freshRows.length} active truck(s) fresh — no push needed`,
        );
      }
      return;
    }

    const invalidTokenIds: string[] = [];
    const ts = new Date().toISOString();
    const now = Date.now();

    await Promise.all(
      rows.map(async (row) => {
        if (!row.fcmToken) return;

        // Per-truck throttle.
        const last = lastPushAt.get(row.truckTokenId);
        if (last && now - last < PER_TRUCK_THROTTLE_MS) {
          return;
        }

        // Skip if the SDK has reported stationary state more recently
        // than any motion event — the truck is parked, the silence is
        // intentional and we shouldn't waste an FCM credit on it.
        // (resolveTruckToken stores the truck token string under
        // truck_token in tracking_diagnostics.)
        const [tokenRow] = await db
          .select({ token: truckTokens.token })
          .from(truckTokens)
          .where(eq(truckTokens.id, row.truckTokenId))
          .limit(1);
        if (tokenRow?.token) {
          const [latestMotion] = await db
            .select({ data: trackingDiagnostics.eventData })
            .from(trackingDiagnostics)
            .where(
              and(
                eq(trackingDiagnostics.truckToken, tokenRow.token),
                eq(trackingDiagnostics.eventType, "motionchange"),
              ),
            )
            .orderBy(desc(trackingDiagnostics.recordedAt))
            .limit(1);
          if (
            latestMotion &&
            (latestMotion.data as { is_moving?: boolean } | null)?.is_moving === false
          ) {
            return;
          }
        }

        const ageSec = row.lastSeen
          ? Math.round((Date.now() - row.lastSeen.getTime()) / 1000)
          : -1;
        const result = await sendDataPush(row.fcmToken, {
          type: "ping_request",
          timestamp: ts,
        });
        if (result.ok) {
          lastSuccessCount++;
          lastPushAt.set(row.truckTokenId, now);
          console.log(
            `[SmartPush] sent truck=${row.truckNumber} last_seen_age=${ageSec}s`,
          );
        } else {
          lastFailureCount++;
          console.warn(
            `[SmartPush] failed truck=${row.truckNumber} code=${result.errorCode} msg=${result.errorMessage}`,
          );
          if (result.invalidToken) {
            invalidTokenIds.push(row.truckTokenId);
          }
        }
      }),
    );

    if (invalidTokenIds.length > 0) {
      lastInvalidatedCount = invalidTokenIds.length;
      const now = new Date();
      await db
        .update(truckTokens)
        .set({ fcmToken: null, fcmTokenUpdatedAt: now })
        .where(inArray(truckTokens.id, invalidTokenIds));
      // Mirror the invalidation to drivers so legacy lookups stay consistent.
      const trucksAffected = await db
        .select({ driverId: truckTokens.driverId })
        .from(truckTokens)
        .where(inArray(truckTokens.id, invalidTokenIds));
      const driverIds = trucksAffected
        .map((r) => r.driverId)
        .filter((d): d is string => !!d);
      if (driverIds.length > 0) {
        await db
          .update(drivers)
          .set({ fcmToken: null, fcmTokenUpdatedAt: now })
          .where(inArray(drivers.id, driverIds));
      }
      console.log(
        `[SmartPush] cleared ${invalidTokenIds.length} invalid FCM token(s)`,
      );
    }

    console.log(
      `[SmartPush] tick: pushed=${lastSuccessCount} failed=${lastFailureCount} invalid=${lastInvalidatedCount} fresh=${lastSkippedFreshCount}`,
    );
  } catch (err) {
    console.error("[SmartPush] tick error:", err);
  } finally {
    isRunning = false;
  }
}

export function startFcmPingTrigger(): void {
  if (intervalId !== null) return;
  if (!isFcmEnabled()) {
    console.log("[SmartPush] FCM disabled, not starting cron");
    return;
  }
  setTimeout(() => {
    void tick();
  }, 5_000);
  intervalId = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  console.log(
    `[SmartPush] cron started (every ${TICK_INTERVAL_MS / 1000}s, staleness=${STALENESS_THRESHOLD_MS / 1000}s)`,
  );
}

export function stopFcmPingTrigger(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[SmartPush] cron stopped");
  }
}
