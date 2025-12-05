import {
  brokers,
  drivers,
  loads,
  stops,
  verificationTokens,
  trackingPings,
  type Broker,
  type InsertBroker,
  type Driver,
  type InsertDriver,
  type Load,
  type InsertLoad,
  type Stop,
  type InsertStop,
  type VerificationToken,
  type TrackingPing,
  type InsertTrackingPing,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Broker operations
  getBroker(id: string): Promise<Broker | undefined>;
  getBrokerByEmail(email: string): Promise<Broker | undefined>;
  createBroker(broker: InsertBroker): Promise<Broker>;
  updateBroker(id: string, data: Partial<Broker>): Promise<Broker | undefined>;

  // Verification token operations
  createVerificationToken(brokerId: string, token: string, expiresAt: Date): Promise<VerificationToken>;
  getVerificationToken(token: string): Promise<VerificationToken | undefined>;
  markTokenUsed(tokenId: string): Promise<void>;

  // Driver operations
  getDriver(id: string): Promise<Driver | undefined>;
  getDriverByPhone(phone: string): Promise<Driver | undefined>;
  createDriver(driver: InsertDriver): Promise<Driver>;

  // Load operations
  getLoad(id: string): Promise<Load | undefined>;
  getLoadsByBroker(brokerId: string): Promise<Load[]>;
  getLoadByToken(token: string, type: 'tracking' | 'driver'): Promise<Load | undefined>;
  createLoad(load: InsertLoad): Promise<Load>;
  updateLoad(id: string, data: Partial<Load>): Promise<Load | undefined>;

  // Stop operations
  createStops(stopsData: InsertStop[]): Promise<Stop[]>;
  getStopsByLoad(loadId: string): Promise<Stop[]>;
  updateStop(id: string, data: Partial<Stop>): Promise<Stop | undefined>;

  // Tracking ping operations
  createTrackingPing(ping: InsertTrackingPing): Promise<TrackingPing>;
  getTrackingPingsByLoad(loadId: string): Promise<TrackingPing[]>;
}

export class DatabaseStorage implements IStorage {
  // Broker operations
  async getBroker(id: string): Promise<Broker | undefined> {
    const [broker] = await db.select().from(brokers).where(eq(brokers.id, id));
    return broker || undefined;
  }

  async getBrokerByEmail(email: string): Promise<Broker | undefined> {
    const [broker] = await db.select().from(brokers).where(eq(brokers.email, email));
    return broker || undefined;
  }

  async createBroker(insertBroker: InsertBroker): Promise<Broker> {
    const [broker] = await db
      .insert(brokers)
      .values(insertBroker)
      .returning();
    return broker;
  }

  async updateBroker(id: string, data: Partial<Broker>): Promise<Broker | undefined> {
    const [broker] = await db
      .update(brokers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(brokers.id, id))
      .returning();
    return broker || undefined;
  }

  // Verification token operations
  async createVerificationToken(brokerId: string, token: string, expiresAt: Date): Promise<VerificationToken> {
    const [verificationToken] = await db
      .insert(verificationTokens)
      .values({ brokerId, token, expiresAt })
      .returning();
    return verificationToken;
  }

  async getVerificationToken(token: string): Promise<VerificationToken | undefined> {
    const [verificationToken] = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.token, token));
    return verificationToken || undefined;
  }

  async markTokenUsed(tokenId: string): Promise<void> {
    await db
      .update(verificationTokens)
      .set({ used: true })
      .where(eq(verificationTokens.id, tokenId));
  }

  // Driver operations
  async getDriver(id: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, id));
    return driver || undefined;
  }

  async getDriverByPhone(phone: string): Promise<Driver | undefined> {
    const [driver] = await db.select().from(drivers).where(eq(drivers.phone, phone));
    return driver || undefined;
  }

  async createDriver(insertDriver: InsertDriver): Promise<Driver> {
    const [driver] = await db
      .insert(drivers)
      .values(insertDriver)
      .returning();
    return driver;
  }

  // Load operations
  async getLoad(id: string): Promise<Load | undefined> {
    const [load] = await db.select().from(loads).where(eq(loads.id, id));
    return load || undefined;
  }

  async getLoadsByBroker(brokerId: string): Promise<Load[]> {
    return await db
      .select()
      .from(loads)
      .where(eq(loads.brokerId, brokerId))
      .orderBy(desc(loads.createdAt));
  }

  async getLoadByToken(token: string, type: 'tracking' | 'driver'): Promise<Load | undefined> {
    const field = type === 'tracking' ? loads.trackingToken : loads.driverToken;
    const [load] = await db.select().from(loads).where(eq(field, token));
    return load || undefined;
  }

  async createLoad(insertLoad: InsertLoad): Promise<Load> {
    const [load] = await db
      .insert(loads)
      .values(insertLoad)
      .returning();
    return load;
  }

  async updateLoad(id: string, data: Partial<Load>): Promise<Load | undefined> {
    const [load] = await db
      .update(loads)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(loads.id, id))
      .returning();
    return load || undefined;
  }

  // Stop operations
  async createStops(stopsData: InsertStop[]): Promise<Stop[]> {
    if (stopsData.length === 0) return [];
    return await db
      .insert(stops)
      .values(stopsData)
      .returning();
  }

  async getStopsByLoad(loadId: string): Promise<Stop[]> {
    return await db
      .select()
      .from(stops)
      .where(eq(stops.loadId, loadId))
      .orderBy(stops.sequence);
  }

  async updateStop(id: string, data: Partial<Stop>): Promise<Stop | undefined> {
    const [stop] = await db
      .update(stops)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stops.id, id))
      .returning();
    return stop || undefined;
  }

  // Tracking ping operations
  async createTrackingPing(ping: InsertTrackingPing): Promise<TrackingPing> {
    const [trackingPing] = await db
      .insert(trackingPings)
      .values(ping)
      .returning();
    return trackingPing;
  }

  async getTrackingPingsByLoad(loadId: string): Promise<TrackingPing[]> {
    return await db
      .select()
      .from(trackingPings)
      .where(eq(trackingPings.loadId, loadId))
      .orderBy(desc(trackingPings.createdAt));
  }
}

export const storage = new DatabaseStorage();
