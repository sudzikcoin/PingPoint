import { db } from "../db";
import { loads, trackingPings } from "@shared/schema";
import { eq, and, inArray, desc, isNotNull } from "drizzle-orm";
import { evaluateGeofencesForActiveLoad } from "../geofence";

const CHECK_INTERVAL_MS = 60 * 1000;
const ACTIVE_STATUSES = ["PLANNED", "IN_TRANSIT", "AT_PICKUP", "AT_DELIVERY"];

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;
let lastRunTime: Date | null = null;
let lastRunDurationMs: number | null = null;
let loadsChecked: number = 0;

export interface GeofenceMonitorStatus {
  enabled: boolean;
  running: boolean;
  lastRun: string | null;
  lastRunDurationMs: number | null;
  loadsChecked: number;
}

export function getGeofenceMonitorStatus(): GeofenceMonitorStatus {
  return {
    enabled: intervalId !== null,
    running: isRunning,
    lastRun: lastRunTime?.toISOString() ?? null,
    lastRunDurationMs,
    loadsChecked,
  };
}

async function runGeofenceCheck(): Promise<void> {
  if (isRunning) {
    console.log("[GeofenceMonitor] Previous check still running, skipping");
    return;
  }

  const startTime = Date.now();
  isRunning = true;
  console.log("[GeofenceMonitor] Geofence check starting...");

  try {
    const activeLoads = await db
      .select({
        id: loads.id,
        loadNumber: loads.loadNumber,
        driverId: loads.driverId,
      })
      .from(loads)
      .where(
        and(
          inArray(loads.status, ACTIVE_STATUSES),
          isNotNull(loads.driverId)
        )
      );

    console.log(`[GeofenceMonitor] Checking ${activeLoads.length} active loads`);
    loadsChecked = activeLoads.length;

    for (const load of activeLoads) {
      if (!load.driverId) continue;

      try {
        const [latestPing] = await db
          .select()
          .from(trackingPings)
          .where(eq(trackingPings.loadId, load.id))
          .orderBy(desc(trackingPings.createdAt))
          .limit(1);

        if (!latestPing) {
          continue;
        }

        const pingAge = Date.now() - new Date(latestPing.createdAt).getTime();
        if (pingAge > 30 * 60 * 1000) {
          continue;
        }

        const lat = parseFloat(latestPing.lat);
        const lng = parseFloat(latestPing.lng);
        const accuracy = latestPing.accuracy ? parseFloat(latestPing.accuracy) : null;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          console.log(`[GeofenceMonitor] Load ${load.loadNumber}: Invalid coordinates, skipping`);
          continue;
        }

        await evaluateGeofencesForActiveLoad(
          load.driverId,
          load.id,
          lat,
          lng,
          accuracy
        );
      } catch (loadError) {
        console.error(`[GeofenceMonitor] Error processing load ${load.loadNumber}:`, loadError);
      }
    }

    lastRunTime = new Date();
    lastRunDurationMs = Date.now() - startTime;
    console.log(`[GeofenceMonitor] Geofence check completed in ${lastRunDurationMs}ms`);
  } catch (error) {
    console.error("[GeofenceMonitor] Error in geofence monitoring:", error);
  } finally {
    isRunning = false;
  }
}

export function startGeofenceMonitoring(): void {
  if (intervalId) {
    console.log("[GeofenceMonitor] Already running");
    return;
  }

  console.log("[GeofenceMonitor] Starting geofence monitoring (every 60s)");
  
  runGeofenceCheck().catch((err) => {
    console.error("[GeofenceMonitor] Error in initial check:", err);
  });

  intervalId = setInterval(() => {
    runGeofenceCheck().catch((err) => {
      console.error("[GeofenceMonitor] Error in scheduled check:", err);
    });
  }, CHECK_INTERVAL_MS);
}

export function stopGeofenceMonitoring(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[GeofenceMonitor] Stopped");
  }
}
