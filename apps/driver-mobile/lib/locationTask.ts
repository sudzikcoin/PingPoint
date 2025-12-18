import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { sendPingWithRetry } from './api';
import { getStoredToken } from './storage';
import { PING_THROTTLE_MS } from './config';

export const LOCATION_TASK_NAME = 'PINGPOINT_LOCATION_TASK';

let lastPingTime = 0;

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Location task error:', error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const now = Date.now();
  if (now - lastPingTime < PING_THROTTLE_MS) {
    return;
  }
  lastPingTime = now;

  const token = await getStoredToken();
  if (!token) {
    console.log('No token stored, skipping ping');
    return;
  }

  const location = locations[locations.length - 1];
  const { latitude, longitude, accuracy, speed } = location.coords;

  try {
    await sendPingWithRetry(token, {
      lat: latitude,
      lng: longitude,
      accuracy: accuracy ?? undefined,
      speed: speed ?? undefined,
      timestamp: location.timestamp,
    });
  } catch (err) {
    console.error('Failed to send ping');
  }
});

export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return false;
  }

  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  return backgroundStatus === 'granted';
}

export async function startLocationTracking(): Promise<boolean> {
  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) {
    return false;
  }

  const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isTaskRegistered) {
    return true;
  }

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 20000,
      distanceInterval: 75,
      deferredUpdatesInterval: 20000,
      deferredUpdatesDistance: 75,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'PingPoint Driver',
        notificationBody: 'Tracking your location for delivery updates',
        notificationColor: '#9b59b6',
      },
    });
    return true;
  } catch (error) {
    console.error('Failed to start location tracking:', error);
    return false;
  }
}

export async function stopLocationTracking(): Promise<void> {
  const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (isTaskRegistered) {
    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch (error) {
      console.error('Failed to stop location tracking:', error);
    }
  }
}

export async function isTrackingActive(): Promise<boolean> {
  return await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
}
