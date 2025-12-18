import { API_BASE_URL, API_TIMEOUT_MS } from './config';
import { QueuedPing, getQueuedPings, removeFromQueue, addToQueue, getStoredToken } from './storage';

export interface PingData {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  timestamp?: number;
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
      body: JSON.stringify({
        lat: data.lat,
        lng: data.lng,
        accuracy: data.accuracy,
        speed: data.speed,
        timestamp: data.timestamp || Date.now(),
      }),
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
