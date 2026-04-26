import { db } from "../db";
import { loads, trackingPings } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { haversineMeters } from "../geofence";

const EPA_DIESEL_KG_PER_GALLON = 10.180;
const LOADED_MPG = 7.0;
const ABERRANT_KM_THRESHOLD = 200;

export interface DeliveryPreview {
  real_miles: number;
  estimated_co2_kg: number | null;
  avg_speed_mph: number | null;
  total_time_minutes: number | null;
  fuel_gal: number | null;
  co2_source: "gps_actual" | "epa_fallback";
  computed_at: string;
}

/**
 * Compute distance, time, speed, fuel, and CO2 from tracking_pings for a load,
 * then cache the result in loads.metadata.delivery_preview. Non-blocking caller
 * pattern: invoke via setImmediate and .catch(console.error).
 */
export async function computeAndCacheDeliveryMetrics(loadId: string): Promise<void> {
  const startedAt = Date.now();

  const pings = await db
    .select({
      lat: trackingPings.lat,
      lng: trackingPings.lng,
      speed: trackingPings.speed,
      fuelRateGph: trackingPings.fuelRateGph,
      totalFuelGal: trackingPings.totalFuelGal,
      recordedAt: trackingPings.recordedAt,
      createdAt: trackingPings.createdAt,
    })
    .from(trackingPings)
    .where(eq(trackingPings.loadId, loadId))
    .orderBy(sql`COALESCE(${trackingPings.recordedAt}, ${trackingPings.createdAt})`);

  if (pings.length < 2) {
    console.log(`[DeliveryMetrics] load=${loadId.substring(0, 8)} insufficient pings (${pings.length}) — skipping`);
    return;
  }

  // Distance via haversine sum, filtering aberrant jumps.
  let totalKm = 0;
  for (let i = 1; i < pings.length; i++) {
    const a = pings[i - 1];
    const b = pings[i];
    const meters = haversineMeters(parseFloat(a.lat), parseFloat(a.lng), parseFloat(b.lat), parseFloat(b.lng));
    const km = meters / 1000;
    if (km < ABERRANT_KM_THRESHOLD) {
      totalKm += km;
    }
  }
  const realMiles = Math.round(totalKm * 0.621371 * 10) / 10;

  // Time span: first → last ping.
  const tsOf = (p: typeof pings[number]): number => {
    const t = p.recordedAt ?? p.createdAt;
    return t instanceof Date ? t.getTime() : new Date(t).getTime();
  };
  const startMs = tsOf(pings[0]);
  const endMs = tsOf(pings[pings.length - 1]);
  const totalMs = Math.max(0, endMs - startMs);
  const totalMinutes = totalMs > 0 ? Math.round((totalMs / 60_000) * 10) / 10 : null;
  const avgSpeedMph =
    totalMs > 0 && realMiles > 0
      ? Math.round((realMiles / (totalMs / 3_600_000)) * 10) / 10
      : null;

  // Fuel: prefer total_fuel_gal delta, then fuel_rate_gph integral, else EPA fallback.
  let fuelGal: number | null = null;
  let co2Source: "gps_actual" | "epa_fallback" = "epa_fallback";

  const firstTotal = firstFiniteFuel(pings.map((p) => p.totalFuelGal));
  const lastTotal = lastFiniteFuel(pings.map((p) => p.totalFuelGal));
  if (firstTotal != null && lastTotal != null) {
    const delta = lastTotal - firstTotal;
    // Sanity gate: positive and within plausible range for a single delivery.
    if (delta > 0 && delta < 500) {
      fuelGal = Math.round(delta * 100) / 100;
      co2Source = "gps_actual";
    }
  }

  if (fuelGal == null) {
    let integralGal = 0;
    let havePairs = 0;
    for (let i = 1; i < pings.length; i++) {
      const prev = pings[i - 1];
      const curr = pings[i];
      const prevRate = numOrNull(prev.fuelRateGph);
      if (prevRate == null || prevRate <= 0) continue;
      const dtHours = (tsOf(curr) - tsOf(prev)) / 3_600_000;
      if (dtHours <= 0 || dtHours > 1) continue; // skip large gaps
      integralGal += prevRate * dtHours;
      havePairs++;
    }
    if (havePairs >= 5 && integralGal > 0) {
      fuelGal = Math.round(integralGal * 100) / 100;
      co2Source = "gps_actual";
    }
  }

  if (fuelGal == null && realMiles > 0) {
    fuelGal = Math.round((realMiles / LOADED_MPG) * 100) / 100;
    co2Source = "epa_fallback";
  }

  const co2Kg = fuelGal != null ? Math.round(fuelGal * EPA_DIESEL_KG_PER_GALLON * 100) / 100 : null;

  const preview: DeliveryPreview = {
    real_miles: realMiles,
    estimated_co2_kg: co2Kg,
    avg_speed_mph: avgSpeedMph,
    total_time_minutes: totalMinutes,
    fuel_gal: fuelGal,
    co2_source: co2Source,
    computed_at: new Date().toISOString(),
  };

  await db
    .update(loads)
    .set({
      metadata: sql`jsonb_set(COALESCE(${loads.metadata}, '{}'::jsonb), '{delivery_preview}', ${JSON.stringify(preview)}::jsonb)`,
      updatedAt: new Date(),
    })
    .where(eq(loads.id, loadId));

  console.log(
    `[DeliveryMetrics] load=${loadId.substring(0, 8)} miles=${realMiles} fuel=${fuelGal} co2=${co2Kg} src=${co2Source} pings=${pings.length} duration=${Date.now() - startedAt}ms`,
  );
}

function numOrNull(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function firstFiniteFuel(arr: Array<string | null | undefined>): number | null {
  for (const v of arr) {
    const n = numOrNull(v);
    if (n != null && n > 0) return n;
  }
  return null;
}

function lastFiniteFuel(arr: Array<string | null | undefined>): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const n = numOrNull(arr[i]);
    if (n != null && n > 0) return n;
  }
  return null;
}
