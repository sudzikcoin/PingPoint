import { db } from "../db";
import { drivers, loads } from "@shared/schema";
import { and, eq, isNotNull, inArray } from "drizzle-orm";
import { sendDataPush, isFcmEnabled } from "../services/fcmService";

const TICK_INTERVAL_MS = 60 * 1000;
const ACTIVE_LOAD_STATUSES = ["PLANNED", "IN_TRANSIT", "AT_PICKUP", "AT_DELIVERY"];

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;
let lastRunTime: Date | null = null;
let lastSuccessCount = 0;
let lastFailureCount = 0;
let lastInvalidatedCount = 0;

export interface FcmPingTriggerStatus {
  enabled: boolean;
  running: boolean;
  lastRun: string | null;
  lastSuccessCount: number;
  lastFailureCount: number;
  lastInvalidatedCount: number;
}

export function getFcmPingTriggerStatus(): FcmPingTriggerStatus {
  return {
    enabled: intervalId !== null,
    running: isRunning,
    lastRun: lastRunTime?.toISOString() ?? null,
    lastSuccessCount,
    lastFailureCount,
    lastInvalidatedCount,
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

  try {
    // Drivers with an FCM token AND at least one active load.
    const rows = await db
      .selectDistinct({
        driverId: drivers.id,
        fcmToken: drivers.fcmToken,
      })
      .from(drivers)
      .innerJoin(loads, eq(loads.driverId, drivers.id))
      .where(
        and(
          isNotNull(drivers.fcmToken),
          inArray(loads.status, ACTIVE_LOAD_STATUSES),
        ),
      );

    if (rows.length === 0) return;

    console.log(`[FCMPing] sending data push to ${rows.length} driver(s)`);

    const invalidDriverIds: string[] = [];
    const ts = new Date().toISOString();

    await Promise.all(
      rows.map(async (row) => {
        if (!row.fcmToken) return;
        const result = await sendDataPush(row.fcmToken, {
          type: "ping_request",
          timestamp: ts,
        });
        if (result.ok) {
          lastSuccessCount++;
        } else {
          lastFailureCount++;
          console.warn(
            `[FCMPing] send failed driver=${row.driverId} code=${result.errorCode} msg=${result.errorMessage}`,
          );
          if (result.invalidToken) {
            invalidDriverIds.push(row.driverId);
          }
        }
      }),
    );

    if (invalidDriverIds.length > 0) {
      lastInvalidatedCount = invalidDriverIds.length;
      await db
        .update(drivers)
        .set({ fcmToken: null, fcmTokenUpdatedAt: new Date() })
        .where(inArray(drivers.id, invalidDriverIds));
      console.log(
        `[FCMPing] cleared ${invalidDriverIds.length} invalid FCM token(s)`,
      );
    }

    console.log(
      `[FCMPing] ok=${lastSuccessCount} fail=${lastFailureCount} invalid=${lastInvalidatedCount}`,
    );
  } catch (err) {
    console.error("[FCMPing] tick error:", err);
  } finally {
    isRunning = false;
  }
}

export function startFcmPingTrigger(): void {
  if (intervalId !== null) return;
  if (!isFcmEnabled()) {
    console.log("[FCMPing] FCM disabled, not starting cron");
    return;
  }
  // Stagger first run by 5s so it doesn't collide with other startup work.
  setTimeout(() => {
    void tick();
  }, 5_000);
  intervalId = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  console.log(
    `[FCMPing] cron started (every ${TICK_INTERVAL_MS / 1000}s)`,
  );
}

export function stopFcmPingTrigger(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[FCMPing] cron stopped");
  }
}
