import { db } from "./db";
import { stops } from "@shared/schema";
import { eq } from "drizzle-orm";

const GEOCODING_API_KEY = process.env.GEOCODING_API_KEY || process.env.MAPBOX_TOKEN || process.env.GOOGLE_MAPS_KEY;

interface GeocodeResult {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!GEOCODING_API_KEY) {
    console.log(`[Geocode] GEOCODE_SKIPPED_NO_KEY address="${address.substring(0, 50)}..."`);
    return null;
  }

  try {
    const encoded = encodeURIComponent(address);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${GEOCODING_API_KEY}&limit=1`;
    
    console.log(`[Geocode] Requesting geocode for: "${address.substring(0, 50)}..."`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[Geocode] API error status=${response.status} for address="${address.substring(0, 50)}..."`);
      return null;
    }

    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      console.log(`[Geocode] SUCCESS address="${address.substring(0, 50)}..." lat=${lat} lng=${lng}`);
      return { lat, lng };
    }

    console.log(`[Geocode] No results for address="${address.substring(0, 50)}..."`);
    return null;
  } catch (error) {
    console.error(`[Geocode] Error geocoding address="${address.substring(0, 50)}...":`, error);
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
