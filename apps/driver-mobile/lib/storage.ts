import AsyncStorage from '@react-native-async-storage/async-storage';
import { IOSiXData } from './iosix/types';

const TOKEN_KEY = 'pp_driver_token';
const QUEUE_KEY = 'pp_ping_queue';

export async function getStoredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  try {
    const oldToken = await getStoredToken();
    if (oldToken && oldToken !== token) {
      await clearQueue();
    }
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    console.error('Failed to store token');
  }
}

export async function clearStoredToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.error('Failed to clear token');
  }
}

export interface QueuedPing {
  token: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  timestamp: number;
  iosix?: IOSiXData | null;
}

export async function getQueuedPings(): Promise<QueuedPing[]> {
  try {
    const data = await AsyncStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addToQueue(ping: QueuedPing): Promise<void> {
  try {
    const queue = await getQueuedPings();
    queue.push(ping);
    if (queue.length > 20) {
      console.warn(`PingPoint: Ping queue overflow — dropped ${queue.length - 20} oldest pings`);
    }
    const trimmed = queue.slice(-20);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to queue ping');
  }
}

export async function clearQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    console.error('Failed to clear queue');
  }
}

export async function removeFromQueue(count: number): Promise<void> {
  try {
    const queue = await getQueuedPings();
    const remaining = queue.slice(count);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  } catch {
    console.error('Failed to update queue');
  }
}
