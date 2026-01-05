import crypto from "crypto";

// Environment configuration with safe defaults
export const GPS_MAX_ACCURACY_METERS = parseInt(process.env.GPS_MAX_ACCURACY_METERS || "5000", 10);
export const GPS_MAX_FUTURE_SKEW_SECONDS = parseInt(process.env.GPS_MAX_FUTURE_SKEW_SECONDS || "300", 10);
export const GPS_MAX_AGE_HOURS = parseInt(process.env.GPS_MAX_AGE_HOURS || "24", 10);
export const GPS_MAX_SPEED_MPH = parseInt(process.env.GPS_MAX_SPEED_MPH || "120", 10);
export const PUBLIC_TRACKING_TTL_DAYS = parseInt(process.env.PUBLIC_TRACKING_TTL_DAYS || "7", 10);
export const PUBLIC_TRACKING_RPM = parseInt(process.env.PUBLIC_TRACKING_RPM || "60", 10);
export const TRACKING_PING_RPM = parseInt(process.env.TRACKING_PING_RPM || "120", 10);

/**
 * Generate a high-entropy token using crypto.randomBytes
 * Returns base64url encoded string (URL-safe)
 */
export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Hash a token using SHA-256
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Timing-safe token comparison
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Haversine distance calculation in meters
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate speed in MPH given distance in meters and time in milliseconds
 */
export function calculateSpeedMph(distanceMeters: number, timeMs: number): number {
  if (timeMs <= 0) return Infinity;
  const metersPerSecond = distanceMeters / (timeMs / 1000);
  const metersPerHour = metersPerSecond * 3600;
  const milesPerHour = metersPerHour / 1609.344;
  return milesPerHour;
}

/**
 * Validate GPS timestamp is within acceptable range
 * Returns error message if invalid, null if valid
 */
export function validateGpsTimestamp(timestamp: Date | string | number): string | null {
  const now = Date.now();
  const ts = new Date(timestamp).getTime();
  
  if (isNaN(ts)) {
    return "invalid_timestamp";
  }
  
  const maxFutureMs = GPS_MAX_FUTURE_SKEW_SECONDS * 1000;
  const maxAgeMs = GPS_MAX_AGE_HOURS * 60 * 60 * 1000;
  
  if (ts > now + maxFutureMs) {
    return "timestamp_future";
  }
  
  if (ts < now - maxAgeMs) {
    return "timestamp_too_old";
  }
  
  return null;
}

/**
 * Validate GPS accuracy is within acceptable range
 * Returns error message if invalid, null if valid
 */
export function validateGpsAccuracy(accuracy: number | null | undefined): string | null {
  if (accuracy == null) return null; // Accuracy is optional
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) {
    return "invalid_accuracy";
  }
  if (accuracy < 0) {
    return "negative_accuracy";
  }
  if (accuracy > GPS_MAX_ACCURACY_METERS) {
    return "accuracy_too_low";
  }
  return null;
}

// In-memory rate limiting for public tracking
const publicTrackingBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if a public tracking request should be allowed
 * Returns true if allowed, false if rate limited
 */
export function checkPublicTrackingRateLimit(ip: string, token: string): boolean {
  const key = `${ip}:${token.substring(0, 16)}`;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  
  const bucket = publicTrackingBuckets.get(key);
  
  if (!bucket || now >= bucket.resetAt) {
    publicTrackingBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (bucket.count >= PUBLIC_TRACKING_RPM) {
    return false;
  }
  
  bucket.count++;
  return true;
}

// Response cache for public tracking
const responseCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 10000; // 10 seconds

/**
 * Get cached public tracking response
 */
export function getCachedResponse(token: string): unknown | null {
  const cached = responseCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  return null;
}

/**
 * Cache public tracking response
 */
export function setCachedResponse(token: string, data: unknown): void {
  responseCache.set(token, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Cleanup stale entries periodically
setInterval(() => {
  const now = Date.now();
  
  // Clean rate limit buckets
  Array.from(publicTrackingBuckets.entries()).forEach(([key, bucket]) => {
    if (now >= bucket.resetAt + 60000) { // Keep for 1 extra minute
      publicTrackingBuckets.delete(key);
    }
  });
  
  // Clean response cache
  Array.from(responseCache.entries()).forEach(([key, cached]) => {
    if (now >= cached.expiresAt) {
      responseCache.delete(key);
    }
  });
}, 60000);

/**
 * Check if public tracking link has expired based on delivery date
 * Returns true if expired, false if still valid
 */
export function isTrackingLinkExpired(deliveredAt: Date | string | null | undefined): boolean {
  if (!deliveredAt) return false; // Active loads never expire
  
  const deliveryDate = new Date(deliveredAt);
  const expiresAt = new Date(deliveryDate.getTime() + PUBLIC_TRACKING_TTL_DAYS * 24 * 60 * 60 * 1000);
  
  return Date.now() > expiresAt.getTime();
}

/**
 * Strip sensitive fields from load data for public response
 */
export function sanitizeLoadForPublic(load: {
  id?: string;
  loadNumber?: string;
  status?: string;
  createdAt?: Date | string;
  deliveredAt?: Date | string | null;
  shipperName?: string;
  brokerId?: unknown;
  driverId?: unknown;
  rateAmount?: unknown;
  trackingToken?: unknown;
  driverToken?: unknown;
  [key: string]: unknown;
}): {
  loadNumber: string | undefined;
  status: string | undefined;
  createdAt: Date | string | undefined;
  deliveredAt: Date | string | null | undefined;
} {
  return {
    loadNumber: load.loadNumber,
    status: load.status,
    createdAt: load.createdAt,
    deliveredAt: load.deliveredAt,
  };
}

/**
 * Strip sensitive fields from stop data for public response
 */
export function sanitizeStopForPublic(stop: {
  id?: string;
  type?: string;
  sequence?: number;
  city?: string | null;
  state?: string | null;
  scheduledArrival?: Date | string | null;
  scheduledDeparture?: Date | string | null;
  arrivedAt?: Date | string | null;
  departedAt?: Date | string | null;
  [key: string]: unknown;
}): {
  type: string | undefined;
  sequence: number | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  scheduledArrival: Date | string | null | undefined;
  scheduledDeparture: Date | string | null | undefined;
  arrivedAt: Date | string | null | undefined;
  departedAt: Date | string | null | undefined;
} {
  return {
    type: stop.type,
    sequence: stop.sequence,
    city: stop.city,
    state: stop.state,
    scheduledArrival: stop.scheduledArrival,
    scheduledDeparture: stop.scheduledDeparture,
    arrivedAt: stop.arrivedAt,
    departedAt: stop.departedAt,
  };
}
