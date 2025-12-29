import {
  brokers,
  drivers,
  loads,
  stops,
  verificationTokens,
  trackingPings,
  rateConfirmationFiles,
  brokerFieldHints,
  activityLogs,
  brokerDevices,
  adminAuditLogs,
  promotions,
  promotionRedemptions,
  referrals,
  brokerEntitlements,
  brokerCredits,
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
  type RateConfirmationFile,
  type BrokerFieldHint,
  type ActivityLog,
  type InsertActivityLog,
  type BrokerDevice,
  type AdminAuditLog,
  type InsertAdminAuditLog,
  type Promotion,
  type InsertPromotion,
  type PromotionRedemption,
  type InsertPromotionRedemption,
  type Referral,
  type InsertReferral,
  type BrokerEntitlement,
  type BrokerCredit,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, ilike, sql, lt, gte, lte, or } from "drizzle-orm";

export interface LoadFilterOptions {
  limit: number;
  offset: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  shipper?: string;
  receiver?: string;
  loadNumber?: string;
  minRate?: number;
  maxRate?: number;
  phone?: string;
  address?: string;
  email?: string;
}

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
  getLoadsByBrokerPaginated(brokerId: string, options: LoadFilterOptions): Promise<{ loads: Load[]; total: number }>;
  getLoadByToken(token: string, type: 'tracking' | 'driver'): Promise<Load | undefined>;
  createLoad(load: InsertLoad): Promise<Load>;
  updateLoad(id: string, data: Partial<Load>): Promise<Load | undefined>;

  // Stop operations
  createStops(stopsData: InsertStop[]): Promise<Stop[]>;
  getStopsByLoad(loadId: string): Promise<Stop[]>;
  getStopById(id: string): Promise<Stop | undefined>;
  updateStop(id: string, data: Partial<Stop>): Promise<Stop | undefined>;

  // Tracking ping operations
  createTrackingPing(ping: InsertTrackingPing): Promise<TrackingPing>;
  getTrackingPingsByLoad(loadId: string): Promise<TrackingPing[]>;

  // Rate confirmation file operations
  createRateConfirmationFile(data: { brokerId: string; loadId?: string | null; fileUrl: string; originalName: string; mimeType?: string; fileSize?: number }): Promise<RateConfirmationFile>;
  getLatestRateConfirmationFile(loadId: string): Promise<RateConfirmationFile | undefined>;
  getRateConfirmationFileById(id: string): Promise<RateConfirmationFile | undefined>;
  getRateConfirmationFilesByBroker(brokerId: string): Promise<RateConfirmationFile[]>;
  hasRateConfirmation(loadId: string): Promise<boolean>;

  // Broker field hints operations
  upsertFieldHint(brokerId: string, fieldKey: string, value: string): Promise<BrokerFieldHint>;
  getFieldHints(brokerId: string, fieldKey: string, query?: string, limit?: number): Promise<BrokerFieldHint[]>;

  // Activity log operations
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogsByEntity(entityType: string, entityId: string, limit?: number): Promise<ActivityLog[]>;

  // Archive operations
  archiveLoad(loadId: string): Promise<Load | undefined>;
  archiveOldDeliveredLoads(daysOld: number): Promise<number>;
  getArchivedLoads(brokerId: string, limit: number, offset: number): Promise<{ loads: Load[]; total: number }>;

  // Broker device operations
  getBrokerDevice(brokerId: string, deviceId: string): Promise<BrokerDevice | undefined>;
  createBrokerDevice(brokerId: string, deviceId: string, userAgent?: string): Promise<BrokerDevice>;
  updateBrokerDeviceLastUsed(id: string): Promise<BrokerDevice | undefined>;

  // Admin operations
  getAllBrokers(limit: number, offset: number): Promise<{ brokers: Broker[]; total: number }>;
  getAllLoadsCount(brokerId: string): Promise<number>;
  getBrokerEntitlement(brokerId: string): Promise<BrokerEntitlement | undefined>;
  getBrokerCreditsBalance(brokerId: string): Promise<number>;
  addBrokerCredits(brokerId: string, amount: number): Promise<BrokerCredit | undefined>;
  createAdminAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog>;
  getAdminAuditLogs(limit?: number, offset?: number): Promise<{ logs: AdminAuditLog[]; total: number }>;
  getActiveSubscriptions(): Promise<BrokerEntitlement[]>;
  getPromotions(): Promise<Promotion[]>;
  createPromotion(promo: InsertPromotion): Promise<Promotion>;
  updatePromotion(id: string, data: Partial<Promotion>): Promise<Promotion | undefined>;
  getBrokerCredits(brokerId: string): Promise<BrokerCredit | undefined>;
  updateBrokerEntitlement(brokerId: string, data: Partial<BrokerEntitlement>): Promise<BrokerEntitlement | undefined>;
  getReferrals(): Promise<Referral[]>;
  createReferral(ref: InsertReferral): Promise<Referral>;
  
  // Promo/Referral operations
  getPromotionByCode(code: string): Promise<Promotion | undefined>;
  getPromotionRedemptionsByUser(brokerId: string, promotionId: string): Promise<PromotionRedemption[]>;
  createPromotionRedemption(redemption: InsertPromotionRedemption): Promise<PromotionRedemption>;
  updatePromotionRedemption(id: string, data: Partial<PromotionRedemption>): Promise<PromotionRedemption | undefined>;
  incrementPromotionRedemptionCount(promotionId: string): Promise<void>;
  getBrokerByReferralCode(code: string): Promise<Broker | undefined>;
  updateBrokerReferralCode(brokerId: string, code: string): Promise<Broker | undefined>;
  getReferralByReferredId(referredId: string): Promise<Referral | undefined>;
  updateReferral(id: string, data: Partial<Referral>): Promise<Referral | undefined>;
  getReferralStats(brokerId: string): Promise<{ totalReferred: number; proSubscribed: number; loadsEarned: number }>;
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

  async getLoadsByBrokerPaginated(
    brokerId: string, 
    options: LoadFilterOptions
  ): Promise<{ loads: Load[]; total: number }> {
    const { limit, offset, status, dateFrom, dateTo, shipper, receiver, loadNumber, minRate, maxRate } = options;
    
    const conditions: any[] = [eq(loads.brokerId, brokerId), eq(loads.isArchived, false)];
    
    if (status) {
      conditions.push(eq(loads.status, status));
    }
    
    if (dateFrom) {
      try {
        conditions.push(gte(loads.createdAt, new Date(dateFrom)));
      } catch {}
    }
    
    if (dateTo) {
      try {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        conditions.push(lte(loads.createdAt, endDate));
      } catch {}
    }
    
    if (shipper) {
      conditions.push(ilike(loads.shipperName, `%${shipper}%`));
    }
    
    if (receiver) {
      conditions.push(ilike(loads.carrierName, `%${receiver}%`));
    }
    
    if (loadNumber) {
      conditions.push(ilike(loads.loadNumber, `%${loadNumber}%`));
    }
    
    if (minRate !== undefined && !isNaN(minRate)) {
      conditions.push(gte(loads.rateAmount, minRate.toString()));
    }
    
    if (maxRate !== undefined && !isNaN(maxRate)) {
      conditions.push(lte(loads.rateAmount, maxRate.toString()));
    }

    const whereConditions = and(...conditions);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(loads)
      .where(whereConditions);

    const loadsList = await db
      .select()
      .from(loads)
      .where(whereConditions)
      .orderBy(desc(loads.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      loads: loadsList,
      total: countResult?.count || 0,
    };
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

  async getStopById(id: string): Promise<Stop | undefined> {
    const [stop] = await db.select().from(stops).where(eq(stops.id, id));
    return stop || undefined;
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

  // Rate confirmation file operations
  async createRateConfirmationFile(data: { brokerId: string; loadId?: string | null; fileUrl: string; originalName: string; mimeType?: string; fileSize?: number }): Promise<RateConfirmationFile> {
    const [file] = await db
      .insert(rateConfirmationFiles)
      .values({
        brokerId: data.brokerId,
        loadId: data.loadId || null,
        fileUrl: data.fileUrl,
        originalName: data.originalName,
        mimeType: data.mimeType || null,
        fileSize: data.fileSize || null,
      })
      .returning();
    return file;
  }

  async getLatestRateConfirmationFile(loadId: string): Promise<RateConfirmationFile | undefined> {
    const [file] = await db
      .select()
      .from(rateConfirmationFiles)
      .where(eq(rateConfirmationFiles.loadId, loadId))
      .orderBy(desc(rateConfirmationFiles.uploadedAt))
      .limit(1);
    return file || undefined;
  }

  async getRateConfirmationFileById(id: string): Promise<RateConfirmationFile | undefined> {
    const [file] = await db
      .select()
      .from(rateConfirmationFiles)
      .where(eq(rateConfirmationFiles.id, id));
    return file || undefined;
  }

  async getRateConfirmationFilesByBroker(brokerId: string): Promise<RateConfirmationFile[]> {
    return await db
      .select()
      .from(rateConfirmationFiles)
      .where(eq(rateConfirmationFiles.brokerId, brokerId))
      .orderBy(desc(rateConfirmationFiles.uploadedAt));
  }

  async hasRateConfirmation(loadId: string): Promise<boolean> {
    const [file] = await db
      .select({ id: rateConfirmationFiles.id })
      .from(rateConfirmationFiles)
      .where(eq(rateConfirmationFiles.loadId, loadId))
      .limit(1);
    return !!file;
  }

  // Broker field hints operations
  async upsertFieldHint(brokerId: string, fieldKey: string, value: string): Promise<BrokerFieldHint> {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      throw new Error("Value cannot be empty");
    }

    // Check if hint already exists
    const [existing] = await db
      .select()
      .from(brokerFieldHints)
      .where(
        and(
          eq(brokerFieldHints.brokerId, brokerId),
          eq(brokerFieldHints.fieldKey, fieldKey),
          eq(brokerFieldHints.value, trimmedValue)
        )
      );

    if (existing) {
      // Update usage count and timestamp
      const [updated] = await db
        .update(brokerFieldHints)
        .set({
          usageCount: existing.usageCount + 1,
          lastUsedAt: new Date(),
        })
        .where(eq(brokerFieldHints.id, existing.id))
        .returning();
      return updated;
    }

    // Create new hint
    const [hint] = await db
      .insert(brokerFieldHints)
      .values({
        brokerId,
        fieldKey,
        value: trimmedValue,
        usageCount: 1,
        lastUsedAt: new Date(),
      })
      .returning();
    return hint;
  }

  async getFieldHints(brokerId: string, fieldKey: string, query?: string, limit: number = 10): Promise<BrokerFieldHint[]> {
    let baseQuery = db
      .select()
      .from(brokerFieldHints)
      .where(
        and(
          eq(brokerFieldHints.brokerId, brokerId),
          eq(brokerFieldHints.fieldKey, fieldKey)
        )
      );

    // If query provided, filter by partial match
    if (query && query.trim()) {
      baseQuery = db
        .select()
        .from(brokerFieldHints)
        .where(
          and(
            eq(brokerFieldHints.brokerId, brokerId),
            eq(brokerFieldHints.fieldKey, fieldKey),
            ilike(brokerFieldHints.value, `%${query.trim()}%`)
          )
        );
    }

    return await baseQuery
      .orderBy(desc(brokerFieldHints.usageCount), desc(brokerFieldHints.lastUsedAt))
      .limit(limit);
  }

  // Activity log operations
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [activityLog] = await db
      .insert(activityLogs)
      .values(log)
      .returning();
    return activityLog;
  }

  async getActivityLogsByEntity(entityType: string, entityId: string, limit: number = 50): Promise<ActivityLog[]> {
    return await db
      .select()
      .from(activityLogs)
      .where(and(
        eq(activityLogs.entityType, entityType),
        eq(activityLogs.entityId, entityId)
      ))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  // Archive operations
  async archiveLoad(loadId: string): Promise<Load | undefined> {
    const [load] = await db
      .update(loads)
      .set({ 
        isArchived: true, 
        archivedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(loads.id, loadId))
      .returning();
    return load || undefined;
  }

  async archiveOldDeliveredLoads(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db
      .update(loads)
      .set({ 
        isArchived: true, 
        archivedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(and(
        eq(loads.status, "DELIVERED"),
        eq(loads.isArchived, false),
        lt(loads.updatedAt, cutoffDate)
      ))
      .returning({ id: loads.id });

    return result.length;
  }

  async getArchivedLoads(brokerId: string, limit: number, offset: number): Promise<{ loads: Load[]; total: number }> {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(loads)
      .where(and(
        eq(loads.brokerId, brokerId),
        eq(loads.isArchived, true)
      ));

    const loadsList = await db
      .select()
      .from(loads)
      .where(and(
        eq(loads.brokerId, brokerId),
        eq(loads.isArchived, true)
      ))
      .orderBy(desc(loads.archivedAt))
      .limit(limit)
      .offset(offset);

    return {
      loads: loadsList,
      total: countResult?.count || 0,
    };
  }

  // Broker device operations
  async getBrokerDevice(brokerId: string, deviceId: string): Promise<BrokerDevice | undefined> {
    const [device] = await db
      .select()
      .from(brokerDevices)
      .where(and(
        eq(brokerDevices.brokerId, brokerId),
        eq(brokerDevices.deviceId, deviceId)
      ));
    return device || undefined;
  }

  async createBrokerDevice(brokerId: string, deviceId: string, userAgent?: string): Promise<BrokerDevice> {
    const [device] = await db
      .insert(brokerDevices)
      .values({
        brokerId,
        deviceId,
        userAgent: userAgent || null,
      })
      .returning();
    return device;
  }

  async updateBrokerDeviceLastUsed(id: string): Promise<BrokerDevice | undefined> {
    const [device] = await db
      .update(brokerDevices)
      .set({ lastUsedAt: new Date() })
      .where(eq(brokerDevices.id, id))
      .returning();
    return device || undefined;
  }

  // Admin operations
  async getAllLoadsCount(brokerId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(loads)
      .where(eq(loads.brokerId, brokerId));
    return result?.count || 0;
  }

  async getBrokerCreditsBalance(brokerId: string): Promise<number> {
    const [credits] = await db
      .select()
      .from(brokerCredits)
      .where(eq(brokerCredits.brokerId, brokerId));
    return credits?.creditsBalance || 0;
  }

  async getAllBrokers(limit: number = 100, offset: number = 0): Promise<{ brokers: Broker[]; total: number }> {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(brokers);

    const brokersList = await db
      .select()
      .from(brokers)
      .orderBy(desc(brokers.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      brokers: brokersList,
      total: countResult?.count || 0,
    };
  }

  async getBrokerEntitlement(brokerId: string): Promise<BrokerEntitlement | undefined> {
    const [entitlement] = await db
      .select()
      .from(brokerEntitlements)
      .where(eq(brokerEntitlements.brokerId, brokerId));
    return entitlement || undefined;
  }

  async getBrokerCredits(brokerId: string): Promise<BrokerCredit | undefined> {
    const [credits] = await db
      .select()
      .from(brokerCredits)
      .where(eq(brokerCredits.brokerId, brokerId));
    return credits || undefined;
  }

  async updateBrokerEntitlement(brokerId: string, data: Partial<BrokerEntitlement>): Promise<BrokerEntitlement | undefined> {
    const [entitlement] = await db
      .update(brokerEntitlements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(brokerEntitlements.brokerId, brokerId))
      .returning();
    return entitlement || undefined;
  }

  async addBrokerCredits(brokerId: string, credits: number): Promise<BrokerCredit | undefined> {
    const existing = await this.getBrokerCredits(brokerId);
    if (existing) {
      const [updated] = await db
        .update(brokerCredits)
        .set({ 
          creditsBalance: existing.creditsBalance + credits,
          updatedAt: new Date() 
        })
        .where(eq(brokerCredits.brokerId, brokerId))
        .returning();
      return updated || undefined;
    } else {
      const [created] = await db
        .insert(brokerCredits)
        .values({ brokerId, creditsBalance: credits })
        .returning();
      return created;
    }
  }

  async createAdminAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [auditLog] = await db
      .insert(adminAuditLogs)
      .values(log)
      .returning();
    return auditLog;
  }

  async getAdminAuditLogs(limit: number = 100, offset: number = 0): Promise<{ logs: AdminAuditLog[]; total: number }> {
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminAuditLogs);

    const logs = await db
      .select()
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      logs,
      total: countResult?.count || 0,
    };
  }

  async getActiveSubscriptions(): Promise<BrokerEntitlement[]> {
    return await db
      .select()
      .from(brokerEntitlements)
      .where(eq(brokerEntitlements.plan, "PRO"));
  }

  // Promotions
  async getPromotions(): Promise<Promotion[]> {
    return await db
      .select()
      .from(promotions)
      .orderBy(desc(promotions.createdAt));
  }

  async createPromotion(promo: InsertPromotion): Promise<Promotion> {
    const [promotion] = await db
      .insert(promotions)
      .values(promo)
      .returning();
    return promotion;
  }

  async updatePromotion(id: string, data: Partial<Promotion>): Promise<Promotion | undefined> {
    const [promotion] = await db
      .update(promotions)
      .set(data)
      .where(eq(promotions.id, id))
      .returning();
    return promotion || undefined;
  }

  // Referrals
  async getReferrals(): Promise<Referral[]> {
    return await db
      .select()
      .from(referrals)
      .orderBy(desc(referrals.createdAt));
  }

  async createReferral(ref: InsertReferral): Promise<Referral> {
    const [referral] = await db
      .insert(referrals)
      .values(ref)
      .returning();
    return referral;
  }

  // Promo/Referral operations
  async getPromotionByCode(code: string): Promise<Promotion | undefined> {
    const [promotion] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.code, code.toUpperCase()));
    return promotion || undefined;
  }

  async getPromotionRedemptionsByUser(brokerId: string, promotionId: string): Promise<PromotionRedemption[]> {
    return await db
      .select()
      .from(promotionRedemptions)
      .where(and(
        eq(promotionRedemptions.brokerId, brokerId),
        eq(promotionRedemptions.promotionId, promotionId)
      ));
  }

  async createPromotionRedemption(redemption: InsertPromotionRedemption): Promise<PromotionRedemption> {
    const [result] = await db
      .insert(promotionRedemptions)
      .values(redemption)
      .returning();
    return result;
  }

  async updatePromotionRedemption(id: string, data: Partial<PromotionRedemption>): Promise<PromotionRedemption | undefined> {
    const [result] = await db
      .update(promotionRedemptions)
      .set(data)
      .where(eq(promotionRedemptions.id, id))
      .returning();
    return result || undefined;
  }

  async incrementPromotionRedemptionCount(promotionId: string): Promise<void> {
    await db
      .update(promotions)
      .set({ redemptionCount: sql`${promotions.redemptionCount} + 1` })
      .where(eq(promotions.id, promotionId));
  }

  async getBrokerByReferralCode(code: string): Promise<Broker | undefined> {
    const [broker] = await db
      .select()
      .from(brokers)
      .where(eq(brokers.referralCode, code.toUpperCase()));
    return broker || undefined;
  }

  async updateBrokerReferralCode(brokerId: string, code: string): Promise<Broker | undefined> {
    const [broker] = await db
      .update(brokers)
      .set({ referralCode: code.toUpperCase(), updatedAt: new Date() })
      .where(eq(brokers.id, brokerId))
      .returning();
    return broker || undefined;
  }

  async getReferralByReferredId(referredId: string): Promise<Referral | undefined> {
    const [referral] = await db
      .select()
      .from(referrals)
      .where(eq(referrals.referredId, referredId));
    return referral || undefined;
  }

  async updateReferral(id: string, data: Partial<Referral>): Promise<Referral | undefined> {
    const [referral] = await db
      .update(referrals)
      .set(data)
      .where(eq(referrals.id, id))
      .returning();
    return referral || undefined;
  }

  async getReferralStats(brokerId: string): Promise<{ totalReferred: number; proSubscribed: number; loadsEarned: number }> {
    const allReferrals = await db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerId, brokerId));
    
    const totalReferred = allReferrals.length;
    const proSubscribed = allReferrals.filter(r => r.status === 'PRO_SUBSCRIBED' || r.status === 'REWARDS_GRANTED').length;
    const loadsEarned = allReferrals.reduce((sum, r) => sum + (r.referrerLoadsGranted || 0), 0);
    
    return { totalReferred, proSubscribed, loadsEarned };
  }
}

export const storage = new DatabaseStorage();
