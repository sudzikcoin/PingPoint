import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const WEB_BASE_URL = 
  process.env.EXPO_PUBLIC_WEB_BASE_URL || 
  extra.webBaseUrl || 
  'http://localhost:5000';

export const API_BASE_URL = 
  process.env.EXPO_PUBLIC_API_BASE_URL || 
  extra.apiBaseUrl || 
  'http://localhost:5000';

export const PING_INTERVAL_MS = 20000;
export const PING_DISTANCE_M = 75;
export const PING_THROTTLE_MS = 10000;
export const MAX_QUEUED_PINGS = 20;
export const API_TIMEOUT_MS = 10000;
