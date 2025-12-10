// Real backend API client for PingPoint
// All calls now go to the actual Express backend

export interface BrokerWorkspace {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  emailVerified: boolean;
  updatedAt?: string;
}

export interface BrokerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  timezone: string;
  emailVerified: boolean;
}

export interface FieldHint {
  value: string;
  usageCount: number;
}

export const api = {
  brokers: {
    ensure: async (email: string, name: string): Promise<BrokerWorkspace> => {
      const res = await fetch('/api/brokers/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to ensure broker');
      }
      
      return res.json();
    },
    
    sendVerification: async (brokerId: string): Promise<{ ok: boolean }> => {
      const res = await fetch('/api/brokers/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to send verification');
      }
      
      return res.json();
    },
    
    me: async (): Promise<BrokerWorkspace> => {
      const res = await fetch('/api/brokers/me', {
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Unauthorized');
      }
      
      return res.json();
    },

    logout: async (): Promise<{ ok: boolean }> => {
      const res = await fetch('/api/brokers/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to logout');
      }
      
      return res.json();
    },

    getProfile: async (): Promise<BrokerProfile> => {
      const res = await fetch('/api/broker/profile', {
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch profile');
      }
      
      return res.json();
    },

    updateProfile: async (data: Partial<BrokerProfile>): Promise<BrokerProfile & { emailChanged?: boolean }> => {
      const res = await fetch('/api/broker/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to update profile' }));
        const error = new Error(errorData.error || 'Failed to update profile') as Error & {
          code?: string;
          emailChanged?: boolean;
          status?: number;
        };
        error.code = errorData.code;
        error.emailChanged = errorData.emailChanged;
        error.status = res.status;
        throw error;
      }
      
      return res.json();
    },

    getHints: async (fieldKey: string, query?: string, limit?: number): Promise<FieldHint[]> => {
      const params = new URLSearchParams({ fieldKey });
      if (query) params.set('q', query);
      if (limit) params.set('limit', limit.toString());
      
      const res = await fetch(`/api/broker/hints?${params}`, {
        credentials: 'include',
      });
      
      if (!res.ok) {
        return [];
      }
      
      return res.json();
    }
  },
  
  loads: {
    create: async (data: any) => {
      const res = await fetch('/api/loads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to create load' }));
        const error = new Error(errorData.error || 'Failed to create load') as Error & {
          code?: string;
          email?: string;
          status?: number;
        };
        error.code = errorData.code;
        error.email = errorData.email;
        error.status = res.status;
        throw error;
      }
      
      return res.json();
    },
    
    list: async (): Promise<any> => {
      const res = await fetch('/api/loads', {
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch loads');
      }
      
      return res.json();
    },
    
    get: async (id: string) => {
      const res = await fetch(`/api/loads/${id}`, {
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch load');
      }
      
      return res.json();
    }
  },

  track: {
    getByToken: async (token: string) => {
      const res = await fetch(`/api/track/${token}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch tracking data');
      }
      
      return res.json();
    }
  },

  driver: {
    getLoad: async (token: string) => {
      const res = await fetch(`/api/driver/${token}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch driver load');
      }
      
      return res.json();
    },

    submitPing: async (token: string, lat: number, lng: number, accuracy?: number) => {
      const res = await fetch(`/api/driver/${token}/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, accuracy }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to submit ping');
      }
      
      return res.json();
    },

    updateStop: async (token: string, stopId: string, data: { arrivedAt?: string, departedAt?: string }) => {
      const res = await fetch(`/api/driver/${token}/stop/${stopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        throw new Error('Failed to update stop');
      }
      
      return res.json();
    }
  }
};
