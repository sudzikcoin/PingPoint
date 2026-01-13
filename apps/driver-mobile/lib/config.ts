import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

const PRODUCTION_API_URL = 'https://6770693b-fc9a-4c02-9b92-87ade92b7c79-00-3kcz61rsl8wvd.worf.replit.dev';

export const WEB_BASE_URL = 
  process.env.EXPO_PUBLIC_WEB_BASE_URL || 
  extra.webBaseUrl || 
  PRODUCTION_API_URL;

export const API_BASE_URL = 
  process.env.EXPO_PUBLIC_API_BASE_URL || 
  extra.apiBaseUrl || 
  PRODUCTION_API_URL;

export const PING_INTERVAL_MS = 20000;
export const PING_DISTANCE_M = 75;
export const PING_THROTTLE_MS = 10000;
export const MAX_QUEUED_PINGS = 20;
export const API_TIMEOUT_MS = 10000;
