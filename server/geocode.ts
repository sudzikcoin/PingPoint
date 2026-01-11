import { db } from "./db";
import { stops } from "@shared/schema";
import { eq } from "drizzle-orm";

const OPENCAGE_API_KEY = process.env.OPENCAGE_API_KEY;

interface GeocodeResult {
  lat: number;
  lng: number;
}

interface CacheEntry {
  result: GeocodeResult | null;
  timestamp: number;
}

const geocodeCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MS = 1100;
let lastRequestTime = 0;

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCachedResult(address: string): GeocodeResult | null | undefined {
  const key = normalizeAddress(address);
  const entry = geocodeCache.get(key);
  
  if (!entry) return undefined;
  
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    geocodeCache.delete(key);
    return undefined;
  }
  
  console.log(`[Geocode] Cache HIT for "${address.substring(0, 40)}..."`);
  return entry.result;
}

function setCachedResult(address: string, result: GeocodeResult | null): void {
  const key = normalizeAddress(address);
  geocodeCache.set(key, { result, timestamp: Date.now() });
}

function validateCoordinates(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.log(`[Geocode] Invalid coordinates: lat=${lat} lng=${lng} (not finite numbers)`);
    return false;
  }
  
  const isValidUSA = lat >= 24 && lat <= 50 && lng >= -130 && lng <= -65;
  const isValidNorthAmerica = lat >= 14 && lat <= 72 && lng >= -170 && lng <= -50;
  
  if (!isValidNorthAmerica) {
    console.log(`[Geocode] Coordinates outside North America: lat=${lat} lng=${lng}`);
    return false;
  }
  
  if (!isValidUSA) {
    console.log(`[Geocode] Coordinates outside continental USA (but valid for North America): lat=${lat} lng=${lng}`);
  }
  
  return true;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  
  if (elapsed < RATE_LIMIT_MS) {
    const waitTime = RATE_LIMIT_MS - elapsed;
    console.log(`[Geocode] Rate limiting: waiting ${waitTime}ms`);
    await sleep(waitTime);
  }
  
  lastRequestTime = Date.now();
}

async function geocodeWithNominatimInternal(address: string): Promise<GeocodeResult | null> {
  await waitForRateLimit();
  
  const encoded = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1&countrycodes=us,ca,mx`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "PingPoint-App/1.0 (logistics tracking platform)",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim HTTP error: ${response.status}`);
  }

  const data = await response.json();

  if (data && data.length > 0) {
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    
    if (validateCoordinates(lat, lng)) {
      console.log(`[Geocode] Nominatim SUCCESS: "${address.substring(0, 40)}..." → lat=${lat.toFixed(5)} lng=${lng.toFixed(5)}`);
      return { lat, lng };
    }
  }

  return null;
}

async function geocodeWithNominatim(address: string): Promise<GeocodeResult | null> {
  const maxRetries = 3;
  const baseDelay = 1000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await geocodeWithNominatimInternal(address);
      return result;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      
      console.log(`[Geocode] Nominatim attempt ${attempt}/${maxRetries} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      if (!isLastAttempt) {
        console.log(`[Geocode] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  console.log(`[Geocode] Nominatim FAILED after ${maxRetries} attempts for "${address.substring(0, 40)}..."`);
  return null;
}

async function geocodeWithOpenCage(address: string): Promise<GeocodeResult | null> {
  if (!OPENCAGE_API_KEY) return null;

  try {
    const encoded = encodeURIComponent(address);
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encoded}&key=${OPENCAGE_API_KEY}&limit=1`;

    const response = await fetch(url);

    if (!response.ok) {
      console.log(`[Geocode] OpenCage error status=${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry;
      
      if (validateCoordinates(lat, lng)) {
        console.log(`[Geocode] OpenCage SUCCESS: "${address.substring(0, 40)}..." → lat=${lat.toFixed(5)} lng=${lng.toFixed(5)}`);
        return { lat, lng };
      }
    }

    return null;
  } catch (error) {
    console.error(`[Geocode] OpenCage error:`, error);
    return null;
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address || address.trim().length < 5) {
    console.log(`[Geocode] Address too short or empty: "${address}"`);
    return null;
  }
  
  console.log(`[Geocode] Requesting geocode for: "${address.substring(0, 50)}..."`);

  const cached = getCachedResult(address);
  if (cached !== undefined) {
    return cached;
  }

  let result = await geocodeWithNominatim(address);

  if (!result && OPENCAGE_API_KEY) {
    console.log(`[Geocode] Nominatim failed, trying OpenCage...`);
    result = await geocodeWithOpenCage(address);
  }

  setCachedResult(address, result);

  if (!result) {
    console.log(`[Geocode] No results for address="${address.substring(0, 50)}..."`);
  }

  return result;
}

export async function geocodeAddressSafe(address: string): Promise<GeocodeResult | null> {
  try {
    return await geocodeAddress(address);
  } catch (error) {
    console.error(`[Geocode] Safe geocode failed for "${address.substring(0, 40)}...":`, error);
    return null;
  }
}

export async function ensureStopCoords(stop: {
  id: string;
  lat: string | null;
  lng: string | null;
  fullAddress: string;
  city: string;
  state: string;
}): Promise<{ lat: number; lng: number } | null> {
  if (stop.lat && stop.lng) {
    const lat = parseFloat(stop.lat);
    const lng = parseFloat(stop.lng);
    
    if (validateCoordinates(lat, lng)) {
      return { lat, lng };
    }
    console.log(`[Geocode] Stop ${stop.id} has invalid stored coords, re-geocoding...`);
  }

  console.log(`[Geocode] Stop ${stop.id} missing/invalid coords, attempting geocode...`);

  let address = stop.fullAddress;
  if (!address || address.trim().length < 5) {
    if (stop.city && stop.state) {
      address = `${stop.city}, ${stop.state}`;
    } else {
      console.log(`[Geocode] Stop ${stop.id} has no valid address for geocoding`);
      return null;
    }
  }

  const result = await geocodeAddressSafe(address);

  if (!result) {
    console.log(`[Geocode] Failed to geocode stop ${stop.id}`);
    return null;
  }

  try {
    await db
      .update(stops)
      .set({
        lat: result.lat.toString(),
        lng: result.lng.toString(),
        updatedAt: new Date(),
      })
      .where(eq(stops.id, stop.id));

    console.log(`[Geocode] Persisted coords for stop ${stop.id}: lat=${result.lat.toFixed(5)} lng=${result.lng.toFixed(5)}`);
    return result;
  } catch (error) {
    console.error(`[Geocode] Failed to persist coords for stop ${stop.id}:`, error);
    return result;
  }
}

export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: geocodeCache.size,
    keys: Array.from(geocodeCache.keys()).slice(0, 10),
  };
}

export function clearCache(): void {
  geocodeCache.clear();
  console.log(`[Geocode] Cache cleared`);
}
