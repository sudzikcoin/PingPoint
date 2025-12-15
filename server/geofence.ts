import { db } from "./db";
import { stops, stopGeofenceState, loads } from "@shared/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";

const CONSECUTIVE_PINGS_REQUIRED = 2;
const MIN_TIME_GAP_MS = 60 * 1000;

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
  currentLng: number
) {
  const loadStops = await db
    .select()
    .from(stops)
    .where(eq(stops.loadId, loadId));

  const now = new Date();

  for (const stop of loadStops) {
    if (stop.departedAt) continue;

    if (!stop.lat || !stop.lng) {
      continue;
    }

    const stopLat = parseFloat(stop.lat);
    const stopLng = parseFloat(stop.lng);
    const radius = stop.geofenceRadiusM || 300;

    const distance = haversineMeters(currentLat, currentLng, stopLat, stopLng);
    const inside = isInsideGeofence(distance, radius);
    const outsideHysteresis = isOutsideWithHysteresis(distance, radius);

    const state = await getOrCreateGeofenceState(stop.id, driverId);

    if (inside) {
      const newInsideStreak = state.insideStreak + 1;
      await updateGeofenceState(stop.id, driverId, {
        lastStatus: "inside",
        insideStreak: newInsideStreak,
        outsideStreak: 0,
      });

      if (!stop.arrivedAt && newInsideStreak >= CONSECUTIVE_PINGS_REQUIRED) {
        const canTrigger =
          !state.lastArriveAttemptAt ||
          now.getTime() - new Date(state.lastArriveAttemptAt).getTime() > MIN_TIME_GAP_MS;

        if (canTrigger) {
          await markStopArrived(stop.id);
          await updateGeofenceState(stop.id, driverId, { lastArriveAttemptAt: now });
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
          await markStopDeparted(stop.id);
          await updateGeofenceState(stop.id, driverId, { lastDepartAttemptAt: now });
        }
      }
    }
  }
}
