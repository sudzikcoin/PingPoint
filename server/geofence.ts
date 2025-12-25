import { db } from "./db";
import { stops, stopGeofenceState, loads, trackingPings } from "@shared/schema";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import { ensureStopCoords } from "./geocode";

const CONSECUTIVE_PINGS_REQUIRED = 2;
const MIN_TIME_GAP_MS = 60 * 1000;
const ACCURACY_THRESHOLD_M = 150;
const IMMEDIATE_TRIGGER_ACCURACY_M = 50;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function isInsideGeofence(distance: number, radius: number): boolean {
  return distance <= radius;
}

export function isOutsideWithHysteresis(distance: number, radius: number): boolean {
  const hysteresis = Math.max(100, radius * 0.33);
  return distance > radius + hysteresis;
}

async function getOrCreateGeofenceState(stopId: string, driverId: string) {
  const [existing] = await db
    .select()
    .from(stopGeofenceState)
    .where(and(eq(stopGeofenceState.stopId, stopId), eq(stopGeofenceState.driverId, driverId)));

  if (existing) return existing;

  const [newState] = await db
    .insert(stopGeofenceState)
    .values({
      stopId,
      driverId,
      lastStatus: null,
      insideStreak: 0,
      outsideStreak: 0,
    })
    .returning();

  return newState;
}

async function updateGeofenceState(
  stopId: string,
  driverId: string,
  updates: Partial<{
    lastStatus: string | null;
    insideStreak: number;
    outsideStreak: number;
    lastArriveAttemptAt: Date | null;
    lastDepartAttemptAt: Date | null;
  }>
) {
  const [updated] = await db
    .update(stopGeofenceState)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(stopGeofenceState.stopId, stopId), eq(stopGeofenceState.driverId, driverId)))
    .returning();

  return updated;
}

async function markStopArrived(stopId: string) {
  const now = new Date();
  await db.update(stops).set({ arrivedAt: now, updatedAt: now }).where(eq(stops.id, stopId));
  console.log(`[Geofence] Auto-ARRIVE triggered for stop ${stopId}`);
}

async function markStopDeparted(stopId: string) {
  const now = new Date();
  await db.update(stops).set({ departedAt: now, updatedAt: now }).where(eq(stops.id, stopId));
  console.log(`[Geofence] Auto-DEPART triggered for stop ${stopId}`);
}

export async function evaluateGeofencesForActiveLoad(
  driverId: string,
  loadId: string,
  currentLat: number,
  currentLng: number,
  accuracy?: number | null
) {
  const parsedAccuracy = accuracy != null && Number.isFinite(accuracy) ? accuracy : null;
  console.log(`[Geofence] Evaluating load=${loadId} driver=${driverId} lat=${currentLat.toFixed(5)} lng=${currentLng.toFixed(5)} acc=${parsedAccuracy ?? 'unknown'}m`);

  if (parsedAccuracy != null && parsedAccuracy > ACCURACY_THRESHOLD_M) {
    console.log(`[Geofence] SKIPPED accuracy=${Math.round(parsedAccuracy)}m > threshold=${ACCURACY_THRESHOLD_M}m (too inaccurate)`);
    return;
  }

  const loadStops = await db
    .select()
    .from(stops)
    .where(eq(stops.loadId, loadId));

  const now = new Date();
  const currentStop = loadStops
    .sort((a, b) => a.sequence - b.sequence)
    .find(s => !s.arrivedAt);

  if (!currentStop) {
    console.log(`[Geofence] No pending stops for load=${loadId}`);
    return;
  }

  for (const stop of loadStops) {
    if (stop.departedAt) continue;

    let stopLat: number;
    let stopLng: number;

    if (!stop.lat || !stop.lng) {
      const coords = await ensureStopCoords({
        id: stop.id,
        lat: stop.lat,
        lng: stop.lng,
        fullAddress: stop.fullAddress,
        city: stop.city,
        state: stop.state,
      });
      if (!coords) {
        console.log(`[Geofence] Stop ${stop.id} (${stop.type}) has no coords and geocoding failed, skipping`);
        continue;
      }
      stopLat = coords.lat;
      stopLng = coords.lng;
    } else {
      stopLat = parseFloat(stop.lat);
      stopLng = parseFloat(stop.lng);
    }

    const radius = stop.geofenceRadiusM || 300;
    const distance = haversineMeters(currentLat, currentLng, stopLat, stopLng);
    const inside = isInsideGeofence(distance, radius);
    const outsideHysteresis = isOutsideWithHysteresis(distance, radius);

    console.log(`[Geofence] Stop ${stop.id} (${stop.type}): dist=${Math.round(distance)}m radius=${radius}m inside=${inside} arrived=${!!stop.arrivedAt}`);

    const state = await getOrCreateGeofenceState(stop.id, driverId);

    if (inside) {
      const newInsideStreak = state.insideStreak + 1;
      await updateGeofenceState(stop.id, driverId, {
        lastStatus: "inside",
        insideStreak: newInsideStreak,
        outsideStreak: 0,
      });

      if (!stop.arrivedAt) {
        const highAccuracy = parsedAccuracy != null && parsedAccuracy <= IMMEDIATE_TRIGGER_ACCURACY_M;
        const shouldTrigger = highAccuracy || newInsideStreak >= CONSECUTIVE_PINGS_REQUIRED;

        if (shouldTrigger) {
          const canTrigger =
            !state.lastArriveAttemptAt ||
            now.getTime() - new Date(state.lastArriveAttemptAt).getTime() > MIN_TIME_GAP_MS;

          if (canTrigger) {
            console.log(`[Geofence] TRIGGER ARRIVE stop=${stop.id} type=${stop.type} dist=${Math.round(distance)}m radius=${radius}m streak=${newInsideStreak} acc=${parsedAccuracy ?? 'unknown'}m`);
            await markStopArrived(stop.id);
            await updateGeofenceState(stop.id, driverId, { lastArriveAttemptAt: now });
          }
        }
      }
    } else if (outsideHysteresis) {
      const newOutsideStreak = state.outsideStreak + 1;
      await updateGeofenceState(stop.id, driverId, {
        lastStatus: "outside",
        insideStreak: 0,
        outsideStreak: newOutsideStreak,
      });

      if (stop.arrivedAt && !stop.departedAt && newOutsideStreak >= CONSECUTIVE_PINGS_REQUIRED) {
        const timeSinceArrive = now.getTime() - new Date(stop.arrivedAt).getTime();
        const canTrigger =
          timeSinceArrive > MIN_TIME_GAP_MS &&
          (!state.lastDepartAttemptAt ||
            now.getTime() - new Date(state.lastDepartAttemptAt).getTime() > MIN_TIME_GAP_MS);

        if (canTrigger) {
          console.log(`[Geofence] TRIGGER DEPART stop=${stop.id} type=${stop.type} dist=${Math.round(distance)}m streak=${newOutsideStreak}`);
          await markStopDeparted(stop.id);
          await updateGeofenceState(stop.id, driverId, { lastDepartAttemptAt: now });
        }
      }
    }
  }
}

export async function getGeofenceDebugInfo(loadId: string): Promise<{
  targetStopId: string | null;
  targetStopType: string | null;
  targetStopSequence: number | null;
  stopLat: number | null;
  stopLng: number | null;
  radiusM: number;
  lastPingLat: number | null;
  lastPingLng: number | null;
  distanceM: number | null;
  inside: boolean | null;
  canAutoArrive: boolean;
  reason: string;
} | null> {
  const [load] = await db.select().from(loads).where(eq(loads.id, loadId));
  if (!load || !load.driverId) {
    return null;
  }

  const loadStops = await db
    .select()
    .from(stops)
    .where(eq(stops.loadId, loadId))
    .orderBy(stops.sequence);

  const targetStop = loadStops.find((s) => !s.arrivedAt);
  if (!targetStop) {
    return {
      targetStopId: null,
      targetStopType: null,
      targetStopSequence: null,
      stopLat: null,
      stopLng: null,
      radiusM: 300,
      lastPingLat: null,
      lastPingLng: null,
      distanceM: null,
      inside: null,
      canAutoArrive: false,
      reason: "all_stops_arrived",
    };
  }

  const radius = targetStop.geofenceRadiusM ?? 300;

  const [latestPing] = await db
    .select()
    .from(trackingPings)
    .where(eq(trackingPings.loadId, loadId))
    .orderBy(desc(trackingPings.createdAt))
    .limit(1);

  const stopCoords = await ensureStopCoords({
    id: targetStop.id,
    lat: targetStop.lat,
    lng: targetStop.lng,
    fullAddress: targetStop.fullAddress,
    city: targetStop.city,
    state: targetStop.state,
  });

  if (!stopCoords) {
    return {
      targetStopId: targetStop.id,
      targetStopType: targetStop.type,
      targetStopSequence: targetStop.sequence,
      stopLat: null,
      stopLng: null,
      radiusM: radius,
      lastPingLat: latestPing ? parseFloat(latestPing.lat) : null,
      lastPingLng: latestPing ? parseFloat(latestPing.lng) : null,
      distanceM: null,
      inside: null,
      canAutoArrive: false,
      reason: "stop_coordinates_missing",
    };
  }

  if (!latestPing) {
    return {
      targetStopId: targetStop.id,
      targetStopType: targetStop.type,
      targetStopSequence: targetStop.sequence,
      stopLat: stopCoords.lat,
      stopLng: stopCoords.lng,
      radiusM: radius,
      lastPingLat: null,
      lastPingLng: null,
      distanceM: null,
      inside: null,
      canAutoArrive: false,
      reason: "no_location_pings",
    };
  }

  const driverLat = parseFloat(latestPing.lat);
  const driverLng = parseFloat(latestPing.lng);
  const distance = haversineMeters(driverLat, driverLng, stopCoords.lat, stopCoords.lng);
  const inside = isInsideGeofence(distance, radius);

  const state = await getOrCreateGeofenceState(targetStop.id, load.driverId);
  const canAutoArrive = inside && !targetStop.arrivedAt && state.insideStreak >= CONSECUTIVE_PINGS_REQUIRED - 1;

  return {
    targetStopId: targetStop.id,
    targetStopType: targetStop.type,
    targetStopSequence: targetStop.sequence,
    stopLat: stopCoords.lat,
    stopLng: stopCoords.lng,
    radiusM: radius,
    lastPingLat: driverLat,
    lastPingLng: driverLng,
    distanceM: Math.round(distance),
    inside,
    canAutoArrive,
    reason: inside ? "inside_geofence" : "outside_geofence",
  };
}
