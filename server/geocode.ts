import { db } from "./db";
import { stops } from "@shared/schema";
import { eq } from "drizzle-orm";

const OPENCAGE_API_KEY = process.env.OPENCAGE_API_KEY;

interface GeocodeResult {
  lat: number;
  lng: number;
}

async function geocodeWithNominatim(address: string): Promise<GeocodeResult | null> {
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "PingPoint/1.0 (logistics tracking platform)",
      },
    });

    if (!response.ok) {
      console.log(`[Geocode] Nominatim error status=${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      console.log(`[Geocode] Nominatim SUCCESS address="${address.substring(0, 50)}..." lat=${lat} lng=${lng}`);
      return { lat, lng };
    }

    return null;
  } catch (error) {
    console.error(`[Geocode] Nominatim error:`, error);
    return null;
  }
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
      console.log(`[Geocode] OpenCage SUCCESS address="${address.substring(0, 50)}..." lat=${lat} lng=${lng}`);
      return { lat, lng };
    }

    return null;
  } catch (error) {
    console.error(`[Geocode] OpenCage error:`, error);
    return null;
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  console.log(`[Geocode] Requesting geocode for: "${address.substring(0, 50)}..."`);

  let result = await geocodeWithNominatim(address);

  if (!result && OPENCAGE_API_KEY) {
    console.log(`[Geocode] Nominatim failed, trying OpenCage...`);
    result = await geocodeWithOpenCage(address);
  }

  if (!result) {
    console.log(`[Geocode] No results for address="${address.substring(0, 50)}..."`);
  }

  return result;
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
    return {
      lat: parseFloat(stop.lat),
      lng: parseFloat(stop.lng),
    };
  }

  console.log(`[Geocode] Stop ${stop.id} missing coords, attempting geocode...`);

  let address = stop.fullAddress;
  if (!address || address.trim().length < 5) {
    if (stop.city && stop.state) {
      address = `${stop.city}, ${stop.state}`;
    } else {
      console.log(`[Geocode] Stop ${stop.id} has no valid address for geocoding (fullAddress="${stop.fullAddress}", city="${stop.city}", state="${stop.state}")`);
      return null;
    }
  }

  const result = await geocodeAddress(address);

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

    console.log(`[Geocode] Persisted coords for stop ${stop.id}: lat=${result.lat} lng=${result.lng}`);
    return result;
  } catch (error) {
    console.error(`[Geocode] Failed to persist coords for stop ${stop.id}:`, error);
    return result;
  }
}
