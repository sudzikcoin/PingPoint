import { addDays, subDays, format } from "date-fns";

// ----- SIMULATED PRISMA CLIENT & DATABASE -----
// This file acts as an in-memory database that persists to localStorage
// It implements the exact schema requested by the user.

// 1. Type Definitions (matching Prisma Schema)

export interface Broker {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationToken {
  id: string;
  brokerId: string;
  token: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface Driver {
  id: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Load {
  id: string;
  brokerId: string;
  driverId: string | null;
  loadNumber: string;
  shipperName: string;
  carrierName: string;
  equipmentType: string;
  customerRef: string | null;
  rateAmount: number;
  status: string;
  trackingToken: string;
  driverToken: string;
  pickupEta: string | null;
  deliveryEta: string | null;
  billingMonth: string | null;
  isBillable: boolean;
  createdAt: string;
  updatedAt: string;
  // Relations (simplified for JSON storage)
  stops: Stop[];
}

export interface Stop {
  id: string;
  loadId: string;
  sequence: number;
  type: "PICKUP" | "DELIVERY";
  name: string;
  fullAddress: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  windowFrom: string | null;
  windowTo: string | null;
  arrivedAt: string | null;
  departedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrackingPing {
  id: string;
  loadId: string;
  driverId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  source: string;
  createdAt: string;
}

export interface RateConfirmationFile {
  id: string;
  loadId: string;
  fileUrl: string;
  originalName: string;
  uploadedAt: string;
}

// 2. LocalStorage Helper

const DB_KEY = "pingpoint_db_v1";

interface DatabaseSchema {
  brokers: Broker[];
  verificationTokens: VerificationToken[];
  drivers: Driver[];
  loads: Load[];
  trackingPings: TrackingPing[];
  rateConfirmationFiles: RateConfirmationFile[];
}

const INITIAL_DB: DatabaseSchema = {
  brokers: [],
  verificationTokens: [],
  drivers: [],
  loads: [],
  trackingPings: [],
  rateConfirmationFiles: []
};

// Load DB from storage
function loadDb(): DatabaseSchema {
  if (typeof window === 'undefined') return INITIAL_DB;
  const stored = localStorage.getItem(DB_KEY);
  if (!stored) return INITIAL_DB;
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to load DB", e);
    return INITIAL_DB;
  }
}

// Save DB to storage
function saveDb(db: DatabaseSchema) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// 3. "Prisma" Client Interface

export const db = {
  broker: {
    findUnique: async (where: { id?: string; email?: string }) => {
      const db = loadDb();
      if (where.id) return db.brokers.find(b => b.id === where.id) || null;
      if (where.email) return db.brokers.find(b => b.email === where.email) || null;
      return null;
    },
    create: async (args: { data: Omit<Broker, 'id' | 'createdAt' | 'updatedAt'> }) => {
      const db = loadDb();
      const newBroker: Broker = {
        id: `broker_${Math.random().toString(36).substring(2, 9)}`,
        ...args.data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.brokers.push(newBroker);
      saveDb(db);
      return newBroker;
    },
    update: async (args: { where: { id: string }; data: Partial<Broker> }) => {
      const db = loadDb();
      const idx = db.brokers.findIndex(b => b.id === args.where.id);
      if (idx === -1) throw new Error("Broker not found");
      
      const updated = { ...db.brokers[idx], ...args.data, updatedAt: new Date().toISOString() };
      db.brokers[idx] = updated;
      saveDb(db);
      return updated;
    }
  },
  
  verificationToken: {
    create: async (args: { data: Omit<VerificationToken, 'id' | 'createdAt'> }) => {
      const db = loadDb();
      const newToken: VerificationToken = {
        id: `vt_${Math.random().toString(36).substring(2, 9)}`,
        ...args.data,
        createdAt: new Date().toISOString()
      };
      db.verificationTokens.push(newToken);
      saveDb(db);
      return newToken;
    },
    findUnique: async (where: { token: string }) => {
      const db = loadDb();
      return db.verificationTokens.find(t => t.token === where.token) || null;
    },
    update: async (args: { where: { id: string }; data: Partial<VerificationToken> }) => {
      const db = loadDb();
      const idx = db.verificationTokens.findIndex(t => t.id === args.where.id);
      if (idx === -1) throw new Error("Token not found");
      
      const updated = { ...db.verificationTokens[idx], ...args.data };
      db.verificationTokens[idx] = updated;
      saveDb(db);
      return updated;
    }
  },

  driver: {
    findFirst: async (where: { phone: string }) => {
      const db = loadDb();
      return db.drivers.find(d => d.phone === where.phone) || null;
    },
    create: async (args: { data: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'> }) => {
      const db = loadDb();
      const newDriver: Driver = {
        id: `drv_${Math.random().toString(36).substring(2, 9)}`,
        ...args.data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.drivers.push(newDriver);
      saveDb(db);
      return newDriver;
    }
  },

  load: {
    create: async (args: { data: any }) => {
      const db = loadDb();
      // Flatten the relation data structure for simple storage
      const { stops, ...loadData } = args.data;
      
      const newLoad: Load = {
        id: `ld_${Date.now()}`,
        ...loadData,
        stops: [], // We'll add stops separately below
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Handle stops
      if (stops && stops.createMany && stops.createMany.data) {
        newLoad.stops = stops.createMany.data.map((s: any, i: number) => ({
          id: `stop_${Date.now()}_${i}`,
          loadId: newLoad.id,
          ...s,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
      }

      db.loads.push(newLoad);
      saveDb(db);
      return newLoad;
    },
    findMany: async (args?: { where?: { brokerId?: string } }) => {
      const db = loadDb();
      let loads = db.loads;
      if (args?.where?.brokerId) {
        loads = loads.filter(l => l.brokerId === args.where!.brokerId);
      }
      return loads;
    },
    findUnique: async (where: { id: string }) => {
      const db = loadDb();
      return db.loads.find(l => l.id === where.id) || null;
    }
  }
};
