import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = __DEV__ 
  ? 'https://your-replit-url.replit.dev' 
  : 'https://your-production-url.com';

let authToken: string | null = null;

export async function initAuth() {
  authToken = await SecureStore.getItemAsync('authToken');
}

export async function setAuthToken(token: string) {
  authToken = token;
  await SecureStore.setItemAsync('authToken', token);
}

export async function clearAuthToken() {
  authToken = null;
  await SecureStore.deleteItemAsync('authToken');
}

export function getAuthToken() {
  return authToken;
}

async function apiRequest<T>(
  path: string, 
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json?.error || json?.message || `HTTP ${res.status}`;
    const error = new Error(msg) as Error & { code?: string; status?: number };
    error.code = json?.code;
    error.status = res.status;
    throw error;
  }
  return json as T;
}

export interface BrokerWorkspace {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  emailVerified: boolean;
  updatedAt?: string;
}

export interface Load {
  id: string;
  loadNumber: string;
  shipperName: string;
  carrierName: string;
  status: string;
  rateAmount: string;
  pickupCity?: string;
  pickupState?: string;
  destinationCity?: string;
  destinationState?: string;
  trackingToken: string;
  driverToken: string;
  stops?: Stop[];
}

export interface Stop {
  id: string;
  type: string;
  name: string;
  city: string;
  state: string;
  fullAddress: string;
  sequence: number;
  windowFrom: string | null;
  windowTo: string | null;
  arrivedAt: string | null;
  departedAt: string | null;
}

export interface TrackingData {
  load: Load;
  pings: Array<{
    lat: number;
    lng: number;
    timestamp: string;
    accuracy?: number;
  }>;
  lastPing?: {
    lat: number;
    lng: number;
    timestamp: string;
  };
}

export const api = {
  brokers: {
    login: async (email: string): Promise<{ code: string; message: string }> => {
      return apiRequest('/api/brokers/login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    },

    signup: async (email: string, name: string, referralCode?: string): Promise<{ id: string; email: string; name: string; code: string; message: string }> => {
      return apiRequest('/api/brokers/signup', {
        method: 'POST',
        body: JSON.stringify({ email, name, referralCode }),
      });
    },

    me: async (): Promise<BrokerWorkspace> => {
      return apiRequest('/api/brokers/me');
    },

    logout: async (): Promise<{ ok: boolean }> => {
      const result = await apiRequest<{ ok: boolean }>('/api/brokers/logout', {
        method: 'POST',
      });
      await clearAuthToken();
      return result;
    },
  },

  loads: {
    list: async (): Promise<{ items: Load[] }> => {
      return apiRequest('/api/loads');
    },

    get: async (id: string): Promise<Load> => {
      return apiRequest(`/api/loads/${id}`);
    },

    create: async (data: any): Promise<Load> => {
      return apiRequest('/api/loads', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  },

  track: {
    getByToken: async (token: string): Promise<TrackingData> => {
      return apiRequest(`/api/track/${token}`);
    },
  },

  driver: {
    getLoad: async (token: string): Promise<Load & { rewardBalance?: number }> => {
      return apiRequest(`/api/driver/${token}`);
    },

    submitPing: async (token: string, lat: number, lng: number, accuracy?: number): Promise<{ ok: boolean }> => {
      return apiRequest(`/api/driver/${token}/ping`, {
        method: 'POST',
        body: JSON.stringify({ lat, lng, accuracy }),
      });
    },

    updateStop: async (token: string, stopId: string, data: { arrivedAt?: string; departedAt?: string }): Promise<any> => {
      return apiRequest(`/api/driver/${token}/stop/${stopId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
  },
};
