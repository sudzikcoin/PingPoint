/**
 * Ping analytics — pure, side-effect-free aggregation over a sequence of
 * tracking_pings rows for a single trip. Called by the internal trip-stats
 * endpoint (GET /api/internal/loads/:loadNumber/trip-stats) at trip end; not
 * invoked on the hot ping-insert path.
 *
 * Inputs:
 *   - pings: TrackingPing rows in chronological order (oldest first)
 *
 * Outputs: TripStats consumed by AgentOS Formula D (pingpointCO2Service).
 */

export interface PingRow {
  lat: string;                 // numeric(9,6) — comes out of Drizzle as string
  lng: string;
  accuracy: string | null;
  speed: string | null;        // mph if phone sent it
  heading: string | null;
  source: string;
  createdAt: Date | string;
  fuelRateGph: string | null;  // IOSiX ELD engine fuel rate, gallons/hour
}

export interface TripStats {
  dataPoints: number;
  durationSeconds: number;
  estimatedDistanceMiles: number;
  avgSpeedMph: number;
  maxSpeedMph: number;
  hardAccelCount: number;      // Δspeed > +15 mph/min (and current speed > 20 mph)
  hardBrakeCount: number;      // Δspeed < −20 mph/min (and current speed > 20 mph)
  cityMilesPct: number;        // miles while 5 < speed ≤ 45 mph
  highwayMilesPct: number;     // miles while speed > 45 mph
  parkedTimePct: number;       // pings at speed ≤ 5 mph
  nightPct: number;            // pings at UTC hour ∈ [23, 0, 1, 2, 3, 4, 5, 6]
  coveragePct: number;         // dataPoints / expected-at-1-per-minute
  firstAt: string | null;
  lastAt: string | null;
  iosixFuelGallons: number | null;  // ∫ fuel_rate_gph dt across IOSiX pings
  iosixDataPoints: number;          // count of pings carrying fuel_rate_gph
}

const EMPTY_STATS: TripStats = {
  dataPoints: 0,
  durationSeconds: 0,
  estimatedDistanceMiles: 0,
  avgSpeedMph: 0,
  maxSpeedMph: 0,
  hardAccelCount: 0,
  hardBrakeCount: 0,
  cityMilesPct: 0,
  highwayMilesPct: 0,
  parkedTimePct: 0,
  nightPct: 0,
  coveragePct: 0,
  firstAt: null,
  lastAt: null,
  iosixFuelGallons: null,
  iosixDataPoints: 0,
};

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.7613;  // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function toMs(t: Date | string): number {
  return typeof t === "string" ? new Date(t).getTime() : t.getTime();
}

function parseNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// PingPoint driver app sends speed in meters/second (Android
// Location.getSpeed() default). Convert to mph for this module's output.
const MPH_PER_MS = 2.23693629;

export function computeTripStats(pings: PingRow[]): TripStats {
  if (!pings || pings.length === 0) return { ...EMPTY_STATS };

  // Sort chronologically just in case caller didn't — defensive, O(n log n).
  const sorted = [...pings].sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

  const firstAt = toMs(sorted[0].createdAt);
  const lastAt = toMs(sorted[sorted.length - 1].createdAt);
  const durationSeconds = Math.max(0, Math.round((lastAt - firstAt) / 1000));

  let totalMiles = 0;
  let cityMiles = 0;
  let highwayMiles = 0;
  let maxSpeedMph = 0;
  let hardAccelCount = 0;
  let hardBrakeCount = 0;
  let parkedPings = 0;
  let nightPings = 0;
  // IOSiX fuel burn: ∫ fuel_rate_gph dt via trapezoidal rule across
  // consecutive pings that BOTH carry fuel_rate_gph. Gaps > 5 min are
  // skipped — the engine may have been off or the ELD disconnected.
  let iosixFuelGallons = 0;
  let iosixDataPoints = 0;
  let iosixSegments = 0;      // consecutive-pair count actually integrated
  const MAX_INTEGRATION_GAP_MIN = 5;

  // Precompute each ping's effective speed: use reported speed if present,
  // else derive from segment haversine + time delta against predecessor.
  const speeds: number[] = new Array(sorted.length).fill(0);
  for (let i = 0; i < sorted.length; i++) {
    const reported = parseNum(sorted[i].speed);
    if (reported !== null && reported >= 0) {
      speeds[i] = reported * MPH_PER_MS;
      continue;
    }
    if (i === 0) {
      speeds[i] = 0;
      continue;
    }
    const a = sorted[i - 1];
    const b = sorted[i];
    const aLat = parseNum(a.lat), aLng = parseNum(a.lng);
    const bLat = parseNum(b.lat), bLng = parseNum(b.lng);
    if (aLat == null || aLng == null || bLat == null || bLng == null) {
      speeds[i] = 0;
      continue;
    }
    const distMi = haversineMiles(aLat, aLng, bLat, bLng);
    const dtH = Math.max(0, (toMs(b.createdAt) - toMs(a.createdAt)) / 3_600_000);
    speeds[i] = dtH > 0 ? distMi / dtH : 0;
  }

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const spd = speeds[i];
    if (spd > maxSpeedMph) maxSpeedMph = spd;
    if (spd <= 5) parkedPings += 1;

    const fuelRate = parseNum(p.fuelRateGph);
    if (fuelRate !== null && fuelRate >= 0) iosixDataPoints += 1;

    // Night driving classification: UTC hour of the ping.
    const hourUtc = new Date(toMs(p.createdAt)).getUTCHours();
    if (hourUtc >= 23 || hourUtc <= 6) nightPings += 1;

    if (i === 0) continue;

    // Segment distance + mode attribution.
    const a = sorted[i - 1];
    const aLat = parseNum(a.lat), aLng = parseNum(a.lng);
    const bLat = parseNum(p.lat), bLng = parseNum(p.lng);
    if (aLat != null && aLng != null && bLat != null && bLng != null) {
      const segMiles = haversineMiles(aLat, aLng, bLat, bLng);
      totalMiles += segMiles;
      // Attribute to city/highway using the segment's tail speed.
      if (spd > 45) highwayMiles += segMiles;
      else if (spd > 5) cityMiles += segMiles;
      // parked segments don't add to city/highway buckets
    }

    // Hard accel/brake from Δspeed over Δt (in minutes).
    // Class 8 trucks accelerate slowly, so thresholds are conservative
    // to avoid counting GPS-noise artifacts as driver events.
    // Also require >20 mph current speed so parking-lot jitter doesn't count.
    const prevSpd = speeds[i - 1];
    const dtMin = (toMs(p.createdAt) - toMs(a.createdAt)) / 60_000;
    if (dtMin > 0 && dtMin < 5 && spd > 20) {         // ignore gaps > 5 min + low-speed noise
      const accelMphPerMin = (spd - prevSpd) / dtMin;
      if (accelMphPerMin > 15) hardAccelCount += 1;    // was >10; Class 8 rarely hits this genuinely
      if (accelMphPerMin < -20) hardBrakeCount += 1;   // was <-15
    }

    // IOSiX fuel integration (trapezoidal). Only valid when both the
    // previous and current ping carry a non-negative fuel_rate_gph AND
    // they are close enough in time for linear interpolation to be sane.
    const prevFuelRate = parseNum(a.fuelRateGph);
    const curFuelRate = parseNum(p.fuelRateGph);
    if (
      prevFuelRate !== null && prevFuelRate >= 0 &&
      curFuelRate !== null && curFuelRate >= 0 &&
      dtMin > 0 && dtMin <= MAX_INTEGRATION_GAP_MIN
    ) {
      const dtHours = dtMin / 60;
      iosixFuelGallons += ((prevFuelRate + curFuelRate) / 2) * dtHours;
      iosixSegments += 1;
    }
  }

  const avgSpeedMph =
    durationSeconds > 0 ? (totalMiles / durationSeconds) * 3600 : 0;

  const cityMilesPct = totalMiles > 0 ? (cityMiles / totalMiles) * 100 : 0;
  const highwayMilesPct = totalMiles > 0 ? (highwayMiles / totalMiles) * 100 : 0;
  const parkedTimePct = sorted.length > 0 ? (parkedPings / sorted.length) * 100 : 0;
  const nightPct = sorted.length > 0 ? (nightPings / sorted.length) * 100 : 0;

  // Coverage is roughly 1 ping / minute when healthy.
  const expected = Math.max(1, Math.round(durationSeconds / 60));
  const coveragePct = Math.min(100, (sorted.length / expected) * 100);

  return {
    dataPoints: sorted.length,
    durationSeconds,
    estimatedDistanceMiles: Number(totalMiles.toFixed(3)),
    avgSpeedMph: Number(avgSpeedMph.toFixed(2)),
    maxSpeedMph: Number(maxSpeedMph.toFixed(2)),
    hardAccelCount,
    hardBrakeCount,
    cityMilesPct: Number(cityMilesPct.toFixed(2)),
    highwayMilesPct: Number(highwayMilesPct.toFixed(2)),
    parkedTimePct: Number(parkedTimePct.toFixed(2)),
    nightPct: Number(nightPct.toFixed(2)),
    coveragePct: Number(coveragePct.toFixed(2)),
    firstAt: new Date(firstAt).toISOString(),
    lastAt: new Date(lastAt).toISOString(),
    iosixFuelGallons: iosixSegments > 0 ? Number(iosixFuelGallons.toFixed(3)) : null,
    iosixDataPoints,
  };
}
