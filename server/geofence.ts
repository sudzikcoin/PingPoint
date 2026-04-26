import { db } from "./db";
import { stops, stopGeofenceState, loads, trackingPings } from "@shared/schema";
import type { RewardEventType } from "@shared/schema";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import { ensureStopCoords } from "./geocode";
import { awardPointsForEvent } from "./services/rewardService";

const CONSECUTIVE_PINGS_REQUIRED = 2;
const MIN_TIME_GAP_MS = 60 * 1000;
const ACCURACY_THRESHOLD_M = 150;
const IMMEDIATE_TRIGGER_ACCURACY_M = 50;
// Дефолтный радиус геофенса — 2 мили (~3200м) для снижения ложных срабатываний GPS drift
const DEFAULT_GEOFENCE_RADIUS_M = 3200;

// In-memory state: предыдущее состояние (inside/outside) по каждому стопу
// Ключ — stopId, значение — был ли водитель внутри на прошлом тике
const stopInsideState: Map<string, boolean> = new Map();

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

async function markStopArrived(
  stopId: string,
  stopType: string,
  driverId: string,
  loadId: string,
  isLast: boolean,
): Promise<boolean> {
  const now = new Date();
  // Idempotent claim: only proceed if this call is the one that set arrived_at.
  const claimed = await db
    .update(stops)
    .set({ arrivedAt: now, updatedAt: now })
    .where(and(eq(stops.id, stopId), isNull(stops.arrivedAt)))
    .returning({ id: stops.id });
  if (claimed.length === 0) {
    console.log(`[Geofence] ARRIVE skipped — stop ${stopId} already arrived`);
    return false;
  }
  console.log(`[Geofence] Auto-ARRIVE triggered for stop ${stopId}`);

  await applyArriveLoadTransition(loadId, stopType, isLast, now);

  const eventType: RewardEventType =
    stopType === "PICKUP" ? "ARRIVE_PICKUP" : "ARRIVE_DELIVERY";
  awardPointsForEvent({ loadId, driverId, eventType }).catch((err) =>
    console.error("[Geofence] Error awarding points for arrive:", err)
  );
  return true;
}

async function applyArriveLoadTransition(
  loadId: string,
  stopType: string,
  isLast: boolean,
  now: Date,
): Promise<void> {
  if (isLast) {
    await db
      .update(loads)
      .set({ status: "AT_DELIVERY", deliveredPendingAt: now, updatedAt: now })
      .where(eq(loads.id, loadId));
    console.log(`[Geofence] load=${loadId.substring(0, 8)} → AT_DELIVERY`);
    // Block F: фоновые расчёты (CO2, pings hash и пр.) подключатся через setImmediate
    setImmediate(() => {
      // intentional: placeholder for Block F background work
    });
  } else if (stopType === "PICKUP") {
    await db
      .update(loads)
      .set({ status: "AT_PICKUP", updatedAt: now })
      .where(and(eq(loads.id, loadId), eq(loads.status, "PLANNED")));
  }
}

async function notifyAgentOSDelivery(loadId: string): Promise<void> {
  const agentosUrl = process.env.AGENTOS_API_BASE_URL || "https://agentos.suverse.io";
  const internalKey = process.env.INTERNAL_API_KEY || process.env.PINGPOINT_INTERNAL_KEY;
  if (!internalKey) {
    console.warn("[Geofence] INTERNAL_API_KEY not set — skipping AgentOS delivery webhook");
    return;
  }

  try {
    // Получаем данные груза и GPS трек
    const [load] = await db.select().from(loads).where(eq(loads.id, loadId));
    if (!load) {
      console.warn(`[Geofence] notifyAgentOSDelivery: load ${loadId} not found`);
      return;
    }

    const allPings = await db
      .select({ lat: trackingPings.lat, lng: trackingPings.lng, ts: trackingPings.createdAt })
      .from(trackingPings)
      .where(eq(trackingPings.loadId, loadId))
      .orderBy(trackingPings.createdAt);

    const gpsTrack = allPings.map(p => ({
      lat: parseFloat(p.lat),
      lng: parseFloat(p.lng),
      ts: p.ts instanceof Date ? p.ts.toISOString() : String(p.ts),
    }));

    const payload = {
      pingpointLoadId: load.id,
      pingpointLoadNumber: load.loadNumber,
      customerRef: load.customerRef,
      driverToken: load.driverToken,
      deliveredAt: new Date().toISOString(),
      gpsTrack,
      pingCount: gpsTrack.length,
    };

    const res = await fetch(`${agentosUrl}/api/internal/pingpoint-delivery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      console.log(`[Geofence] ✅ AgentOS delivery webhook sent for load ${load.loadNumber} (${gpsTrack.length} pings)`);
    } else {
      console.warn(`[Geofence] AgentOS delivery webhook non-2xx: ${res.status}`);
    }
  } catch (err: any) {
    console.warn(`[Geofence] AgentOS delivery webhook failed:`, err?.message || err);
  }
}

async function markStopDeparted(
  stopId: string,
  stopType: string,
  driverId: string,
  loadId: string
): Promise<void> {
  const now = new Date();

  // Determine ordering up-front (used by both ARRIVE-synthesis and IN_TRANSIT logic).
  const allStops = await db
    .select({ id: stops.id, sequence: stops.sequence })
    .from(stops)
    .where(eq(stops.loadId, loadId));
  const sorted = [...allStops].sort((a, b) => a.sequence - b.sequence);
  const isFirst = sorted[0]?.id === stopId;
  const isLast = sorted[sorted.length - 1]?.id === stopId;

  // Synthesize ARRIVE if depart fires without a prior arrive (GPS gap, fast pass-through).
  // Claim atomically by gating on arrived_at IS NULL so two concurrent depart calls
  // don't both try to fire ARRIVE downstream.
  const synthClaimed = await db
    .update(stops)
    .set({
      arrivedAt: new Date(now.getTime() - 1000),
      departedAt: now,
      updatedAt: now,
    })
    .where(and(eq(stops.id, stopId), isNull(stops.arrivedAt)))
    .returning({ id: stops.id });

  const synthesizedArrive = synthClaimed.length > 0;

  if (synthesizedArrive) {
    console.log(`[Geofence] DEPART without prior ARRIVE — synthesizing ARRIVE for stop ${stopId}`);
    await applyArriveLoadTransition(loadId, stopType, isLast, now);
    const arriveEvent: RewardEventType =
      stopType === "PICKUP" ? "ARRIVE_PICKUP" : "ARRIVE_DELIVERY";
    awardPointsForEvent({ loadId, driverId, eventType: arriveEvent }).catch((err) =>
      console.error("[Geofence] Error awarding points for synthesized arrive:", err)
    );
  } else {
    await db.update(stops).set({ departedAt: now, updatedAt: now }).where(eq(stops.id, stopId));
  }
  console.log(`[Geofence] Auto-DEPART triggered for stop ${stopId}`);

  // Status advance on depart: only first PICKUP → IN_TRANSIT.
  // Last-delivery DELIVERED transition removed — that flips later via BOL flow.
  if (isFirst) {
    try {
      await db
        .update(loads)
        .set({ status: "IN_TRANSIT", updatedAt: now })
        .where(eq(loads.id, loadId));
      console.log(`[Geofence] load=${loadId.substring(0, 8)} → IN_TRANSIT`);
    } catch (err) {
      console.warn("[Geofence] status-advance failed:", err);
    }
  }

  const eventType: RewardEventType =
    stopType === "PICKUP" ? "DEPART_PICKUP" : "DEPART_DELIVERY";
  awardPointsForEvent({ loadId, driverId, eventType }).catch((err) =>
    console.error("[Geofence] Error awarding points for depart:", err)
  );

  // При выезде из DELIVERY — уведомляем AgentOS для CO2/Solana верификации
  if (stopType === "DELIVERY") {
    setImmediate(() => {
      notifyAgentOSDelivery(loadId).catch((err: any) =>
        console.error("[Geofence] notifyAgentOSDelivery error:", err?.message || err)
      );
    });
  }
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

  // Early return: don't fire geofence events on loads that have already passed
  // the AT_DELIVERY gate, are awaiting BOL, are delivered, or were cancelled.
  const [loadRow] = await db
    .select({ status: loads.status })
    .from(loads)
    .where(eq(loads.id, loadId));
  if (
    loadRow &&
    ["AT_DELIVERY", "DELIVERED_PENDING_BOL", "DELIVERED", "CANCELLED"].includes(loadRow.status)
  ) {
    console.log(`[Geofence] SKIPPED — load ${loadId.substring(0, 8)} status=${loadRow.status}`);
    return;
  }

  const loadStops = await db
    .select()
    .from(stops)
    .where(eq(stops.loadId, loadId));

  const now = new Date();
  const sortedStops = [...loadStops].sort((a, b) => a.sequence - b.sequence);
  const lastStopId = sortedStops[sortedStops.length - 1]?.id;
  const currentStop = sortedStops.find(s => !s.arrivedAt);

  if (!currentStop) {
    console.log(`[Geofence] No pending stops for load=${loadId}`);
    return;
  }

  for (const stop of loadStops) {
    // Полностью пропускаем стопы, с которых водитель уже уехал
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

    // Используем радиус из БД либо дефолтные 3200м (2 мили)
    const radius = stop.geofenceRadiusM || DEFAULT_GEOFENCE_RADIUS_M;
    const distance = haversineMeters(currentLat, currentLng, stopLat, stopLng);
    const inside = isInsideGeofence(distance, radius);
    const outsideHysteresis = isOutsideWithHysteresis(distance, radius);

    // Предыдущее состояние из памяти (undefined — стоп ещё не проверялся в этой сессии)
    const prevInside = stopInsideState.get(stop.id);

    console.log(`[Geofence] Stop ${stop.id} (${stop.type}): dist=${Math.round(distance)}m radius=${radius}m inside=${inside} prevInside=${prevInside} arrived=${!!stop.arrivedAt}`);

    const state = await getOrCreateGeofenceState(stop.id, driverId);

    if (inside) {
      const newInsideStreak = state.insideStreak + 1;
      await updateGeofenceState(stop.id, driverId, {
        lastStatus: "inside",
        insideStreak: newInsideStreak,
        outsideStreak: 0,
      });

      // ARRIVE: переход outside → inside И стоп ещё не был отмечен как прибывший.
      // Если prevInside === undefined (первый тик) — считаем это переходом только при достаточной точности GPS
      // или при достижении порога подряд идущих пингов внутри.
      const isTransitionIn = prevInside === false || prevInside === undefined;
      if (isTransitionIn && !stop.arrivedAt) {
        const highAccuracy = parsedAccuracy != null && parsedAccuracy <= IMMEDIATE_TRIGGER_ACCURACY_M;
        const shouldTrigger = highAccuracy || newInsideStreak >= CONSECUTIVE_PINGS_REQUIRED;

        if (shouldTrigger) {
          const canTrigger =
            !state.lastArriveAttemptAt ||
            now.getTime() - new Date(state.lastArriveAttemptAt).getTime() > MIN_TIME_GAP_MS;

          if (canTrigger) {
            console.log(`[Geofence] TRIGGER ARRIVE stop=${stop.id} type=${stop.type} dist=${Math.round(distance)}m radius=${radius}m streak=${newInsideStreak} acc=${parsedAccuracy ?? 'unknown'}m`);
            await markStopArrived(stop.id, stop.type, driverId, loadId, stop.id === lastStopId);
            await updateGeofenceState(stop.id, driverId, { lastArriveAttemptAt: now });
          }
        }
      }

      // Фиксируем текущее состояние — внутри
      stopInsideState.set(stop.id, true);
    } else if (outsideHysteresis) {
      const newOutsideStreak = state.outsideStreak + 1;
      await updateGeofenceState(stop.id, driverId, {
        lastStatus: "outside",
        insideStreak: 0,
        outsideStreak: newOutsideStreak,
      });

      // DEPART: переход inside → outside И arrivedAt есть И departedAt ещё нет
      const isTransitionOut = prevInside === true;
      if (
        isTransitionOut &&
        stop.arrivedAt &&
        !stop.departedAt &&
        newOutsideStreak >= CONSECUTIVE_PINGS_REQUIRED
      ) {
        const timeSinceArrive = now.getTime() - new Date(stop.arrivedAt).getTime();
        const canTrigger =
          timeSinceArrive > MIN_TIME_GAP_MS &&
          (!state.lastDepartAttemptAt ||
            now.getTime() - new Date(state.lastDepartAttemptAt).getTime() > MIN_TIME_GAP_MS);

        if (canTrigger) {
          console.log(`[Geofence] TRIGGER DEPART stop=${stop.id} type=${stop.type} dist=${Math.round(distance)}m streak=${newOutsideStreak}`);
          await markStopDeparted(stop.id, stop.type, driverId, loadId);
          await updateGeofenceState(stop.id, driverId, { lastDepartAttemptAt: now });
        }
      }

      // Фиксируем текущее состояние — снаружи (только если уверены, с учётом гистерезиса)
      stopInsideState.set(stop.id, false);
    }
    // Если в "серой зоне" гистерезиса — состояние не трогаем, чтобы избежать дрейфа
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
      radiusM: DEFAULT_GEOFENCE_RADIUS_M,
      lastPingLat: null,
      lastPingLng: null,
      distanceM: null,
      inside: null,
      canAutoArrive: false,
      reason: "all_stops_arrived",
    };
  }

  const radius = targetStop.geofenceRadiusM ?? DEFAULT_GEOFENCE_RADIUS_M;

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
