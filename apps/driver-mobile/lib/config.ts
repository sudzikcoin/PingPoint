import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

const PRODUCTION_API_URL = 'https://pingpoint.suverse.io';

export const WEB_BASE_URL = 
  process.env.EXPO_PUBLIC_WEB_BASE_URL || 
  extra.webBaseUrl || 
  PRODUCTION_API_URL;

export const API_BASE_URL = 
  process.env.EXPO_PUBLIC_API_BASE_URL || 
  extra.apiBaseUrl || 
  PRODUCTION_API_URL;

export const PING_INTERVAL_MS = 15000;
export const PING_DISTANCE_M = 30;
export const PING_THROTTLE_MS = 10000;
export const MAX_QUEUED_PINGS = 20;
export const API_TIMEOUT_MS = 10000;
