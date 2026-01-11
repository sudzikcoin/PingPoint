import { db } from "../db";
import { loads, trackingPings } from "@shared/schema";
import { eq, and, inArray, desc, isNotNull } from "drizzle-orm";
import { evaluateGeofencesForActiveLoad } from "../geofence";
import { logger } from "../utils/logger";

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
    logger.debug("Geofence monitor: previous check still running, skipping");
    return;
  }

  const startTime = Date.now();
  isRunning = true;
  logger.debug("Geofence check starting...");

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

    logger.info(`Geofence monitor: checking ${activeLoads.length} active loads`, { loadsCount: activeLoads.length });
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
          logger.warn(`Geofence monitor: Load ${load.loadNumber} has invalid coordinates`, { loadNumber: load.loadNumber });
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
        logger.error(`Geofence monitor: Error processing load ${load.loadNumber}`, {
          loadNumber: load.loadNumber,
          error: loadError instanceof Error ? loadError.message : String(loadError),
        });
      }
    }

    lastRunTime = new Date();
    lastRunDurationMs = Date.now() - startTime;
    logger.debug(`Geofence check completed in ${lastRunDurationMs}ms`, { durationMs: lastRunDurationMs });
  } catch (error) {
    logger.error("Geofence monitor: Error in geofence monitoring", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
}

export function startGeofenceMonitoring(): void {
  if (intervalId) {
    logger.warn("Geofence monitor: Already running");
    return;
  }

  logger.info("Geofence monitor: Starting (every 60s)");
  
  runGeofenceCheck().catch((err) => {
    logger.error("Geofence monitor: Error in initial check", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  intervalId = setInterval(() => {
    runGeofenceCheck().catch((err) => {
      logger.error("Geofence monitor: Error in scheduled check", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, CHECK_INTERVAL_MS);
}

export function stopGeofenceMonitoring(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Geofence monitor: Stopped");
  }
}
