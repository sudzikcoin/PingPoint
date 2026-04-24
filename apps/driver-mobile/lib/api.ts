import { API_BASE_URL, API_TIMEOUT_MS } from './config';
import { QueuedPing, getQueuedPings, removeFromQueue, addToQueue, getStoredToken } from './storage';
import { IOSiXData } from './iosix/types';
import { IOSIX_MAC } from './iosix/service';

export interface PingData {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  timestamp?: number;
  iosix?: IOSiXData | null;
}

function buildPingBody(data: PingData): Record<string, unknown> {
  const t = data.iosix ?? null;
  const body: Record<string, unknown> = {
    lat: data.lat,
    lng: data.lng,
    accuracy: data.accuracy,
    speed: data.speed,
    heading: t?.heading ?? undefined,
    timestamp: data.timestamp || Date.now(),
    rpm: t?.rpm ?? null,
    engineLoadPct: t?.engineLoadPct ?? null,
    coolantTempC: t?.coolantTempC ?? null,
    oilPressureKpa: t?.oilPressureKpa ?? null,
    fuelRateGph: t?.fuelRateGph ?? null,
    totalFuelUsedGal: t?.totalFuelUsedGal ?? null,
    engineHours: t?.engineHours ?? null,
    throttlePct: t?.throttlePct ?? null,
    batteryVoltage: t?.batteryVoltage ?? null,
    odometerMiles: t?.odometerMiles ?? null,
    tripMiles: t?.tripMiles ?? null,
    currentGear: t?.currentGear ?? null,
    dpfSootLoadPct: t?.dpfSootLoadPct ?? null,
    defLevelPct: t?.defLevelPct ?? null,
    activeDtcCount: t?.activeDtcCount ?? null,
    activeDtcCodes: t?.activeDtcCodes ?? null,
    eldConnected: t?.connected ?? false,
    eldMac: t?.connected ? IOSIX_MAC : null,
    eldPacketCycleComplete: t?.packetCycleComplete ?? false,
  };
  return body;
}

export async function sendPing(token: string, data: PingData): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/api/driver/${token}/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildPingBody(data)),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    clearTimeout(timeoutId);
    return false;
  }
}

export async function sendPingWithRetry(token: string, data: PingData): Promise<boolean> {
  const success = await sendPing(token, data);

  if (!success) {
    await addToQueue({
      token,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      speed: data.speed,
      timestamp: data.timestamp || Date.now(),
      iosix: data.iosix ?? null,
    });
    return false;
  }

  await flushQueue(token);
  return true;
}

export async function flushQueue(currentToken: string): Promise<void> {
  const queue = await getQueuedPings();
  if (queue.length === 0) return;

  const matchingPings = queue.filter(p => p.token === currentToken);
  if (matchingPings.length === 0) return;

  let successCount = 0;
  
  for (const ping of queue) {
    if (ping.token !== currentToken) {
      successCount++;
      continue;
    }
    
    const success = await sendPing(ping.token, {
      lat: ping.lat,
      lng: ping.lng,
      accuracy: ping.accuracy,
      speed: ping.speed,
      timestamp: ping.timestamp,
      iosix: ping.iosix ?? null,
    });
    
    if (success) {
      successCount++;
    } else {
      break;
    }
  }

  if (successCount > 0) {
    await removeFromQueue(successCount);
  }
}
