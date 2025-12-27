import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, decimal, integer, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Broker model
export const brokers = pgTable("brokers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  timezone: text("timezone").default("Central (CT)"),
  emailVerified: boolean("email_verified").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  referralCode: text("referral_code").unique(), // Personal referral code for sharing
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const brokersRelations = relations(brokers, ({ many }) => ({
  loads: many(loads),
  verificationTokens: many(verificationTokens),
  fieldHints: many(brokerFieldHints),
  devices: many(brokerDevices),
}));

// Broker Field Hints - for typeahead suggestions
export const brokerFieldHints = pgTable("broker_field_hints", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id),
  fieldKey: text("field_key").notNull(),
  value: text("value").notNull(),
  usageCount: integer("usage_count").notNull().default(1),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const brokerFieldHintsRelations = relations(brokerFieldHints, ({ one }) => ({
  broker: one(brokers, {
    fields: [brokerFieldHints.brokerId],
    references: [brokers.id],
  }),
}));

// Verification Token model
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const verificationTokensRelations = relations(verificationTokens, ({ one }) => ({
  broker: one(brokers, {
    fields: [verificationTokens.brokerId],
    references: [brokers.id],
  }),
}));

// Broker Trusted Devices model
export const brokerDevices = pgTable("broker_devices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id),
  deviceId: text("device_id").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const brokerDevicesRelations = relations(brokerDevices, ({ one }) => ({
  broker: one(brokers, {
    fields: [brokerDevices.brokerId],
    references: [brokers.id],
  }),
}));

// Driver model
export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const driversRelations = relations(drivers, ({ many }) => ({
  loads: many(loads),
  trackingPings: many(trackingPings),
}));

// Load model
export const loads = pgTable("loads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id),
  driverId: uuid("driver_id").references(() => drivers.id),
  loadNumber: text("load_number").notNull().unique(),
  shipperName: text("shipper_name").notNull(),
  carrierName: text("carrier_name").notNull(),
  equipmentType: text("equipment_type").notNull(),
  customerRef: text("customer_ref"),
  rateAmount: decimal("rate_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("PLANNED"), // PLANNED, IN_TRANSIT, AT_PICKUP, DELIVERED, etc.
  trackingToken: text("tracking_token").notNull().unique(),
  driverToken: text("driver_token").notNull().unique(),
  pickupEta: timestamp("pickup_eta", { withTimezone: true }),
  deliveryEta: timestamp("delivery_eta", { withTimezone: true }),
  billingMonth: timestamp("billing_month", { mode: 'date' }),
  isBillable: boolean("is_billable").notNull().default(true),
  isArchived: boolean("is_archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  trackingEndedAt: timestamp("tracking_ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const loadsRelations = relations(loads, ({ one, many }) => ({
  broker: one(brokers, {
    fields: [loads.brokerId],
    references: [brokers.id],
  }),
  driver: one(drivers, {
    fields: [loads.driverId],
    references: [drivers.id],
  }),
  stops: many(stops),
  trackingPings: many(trackingPings),
  rateConfirmationFiles: many(rateConfirmationFiles),
}));

// Stop model
export const stops = pgTable("stops", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loadId: uuid("load_id").notNull().references(() => loads.id),
  sequence: integer("sequence").notNull(),
  type: text("type").notNull(), // "PICKUP" or "DELIVERY"
  name: text("name").notNull(),
  fullAddress: text("full_address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  lat: decimal("lat", { precision: 9, scale: 6 }),
  lng: decimal("lng", { precision: 9, scale: 6 }),
  geofenceRadiusM: integer("geofence_radius_m").notNull().default(300),
  windowFrom: timestamp("window_from", { withTimezone: true }),
  windowTo: timestamp("window_to", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  departedAt: timestamp("departed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const stopsRelations = relations(stops, ({ one }) => ({
  load: one(loads, {
    fields: [stops.loadId],
    references: [loads.id],
  }),
}));

// Tracking Ping model
export const trackingPings = pgTable("tracking_pings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loadId: uuid("load_id").notNull().references(() => loads.id),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  lat: decimal("lat", { precision: 9, scale: 6 }).notNull(),
  lng: decimal("lng", { precision: 9, scale: 6 }).notNull(),
  accuracy: decimal("accuracy", { precision: 6, scale: 2 }),
  speed: decimal("speed", { precision: 6, scale: 2 }),
  heading: decimal("heading", { precision: 5, scale: 2 }),
  source: text("source").notNull(), // DRIVER_APP, MANUAL, ELD, etc.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const trackingPingsRelations = relations(trackingPings, ({ one }) => ({
  load: one(loads, {
    fields: [trackingPings.loadId],
    references: [loads.id],
  }),
  driver: one(drivers, {
    fields: [trackingPings.driverId],
    references: [drivers.id],
  }),
}));

// Rate Confirmation File model
export const rateConfirmationFiles = pgTable("rate_confirmation_files", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loadId: uuid("load_id").notNull().references(() => loads.id),
  fileUrl: text("file_url").notNull(),
  originalName: text("original_name").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const rateConfirmationFilesRelations = relations(rateConfirmationFiles, ({ one }) => ({
  load: one(loads, {
    fields: [rateConfirmationFiles.loadId],
    references: [loads.id],
  }),
}));

// Broker Entitlements (billing limits per cycle)
export const brokerEntitlements = pgTable("broker_entitlements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id).unique(),
  plan: text("plan").notNull().default("FREE"),
  cycleStartAt: timestamp("cycle_start_at", { withTimezone: true }).notNull(),
  cycleEndAt: timestamp("cycle_end_at", { withTimezone: true }).notNull(),
  includedLoads: integer("included_loads").notNull().default(3),
  loadsUsed: integer("loads_used").notNull().default(0),
  status: text("status").notNull().default("active"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const brokerEntitlementsRelations = relations(brokerEntitlements, ({ one }) => ({
  broker: one(brokers, {
    fields: [brokerEntitlements.brokerId],
    references: [brokers.id],
  }),
}));

// Broker Credits (extra load credits purchased)
export const brokerCredits = pgTable("broker_credits", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id).unique(),
  creditsBalance: integer("credits_balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const brokerCreditsRelations = relations(brokerCredits, ({ one }) => ({
  broker: one(brokers, {
    fields: [brokerCredits.brokerId],
    references: [brokers.id],
  }),
}));

// Stripe Webhook Events (idempotency tracking)
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: text("event_id").notNull().unique(),
  type: text("type"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Stripe Payments (payment records)
export const stripePayments = pgTable("stripe_payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id),
  checkoutSessionId: text("checkout_session_id"),
  paymentIntentId: text("payment_intent_id"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull(),
  creditsGranted: integer("credits_granted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const stripePaymentsRelations = relations(stripePayments, ({ one }) => ({
  broker: one(brokers, {
    fields: [stripePayments.brokerId],
    references: [brokers.id],
  }),
}));

// Solana Payment Intents (for PRO plan USDC payments)
export const solanaPaymentIntents = pgTable("solana_payment_intents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id),
  planCode: text("plan_code").notNull().default("PRO"),
  amountBaseUnits: text("amount_base_units").notNull(), // USDC has 6 decimals, store as string for BigInt
  reference: text("reference").notNull().unique(), // Solana Pay reference pubkey (base58)
  status: text("status").notNull().default("PENDING"), // PENDING, CONFIRMED, EXPIRED
  signature: text("signature"), // Transaction signature when confirmed
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const solanaPaymentIntentsRelations = relations(solanaPaymentIntents, ({ one }) => ({
  broker: one(brokers, {
    fields: [solanaPaymentIntents.brokerId],
    references: [brokers.id],
  }),
}));

// Broker Usage tracking (separate from entitlements for demo/billing architecture)
export const brokerUsage = pgTable("broker_usage", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id).unique(),
  cycleStartAt: timestamp("cycle_start_at", { withTimezone: true }).notNull().default(sql`now()`),
  cycleEndAt: timestamp("cycle_end_at", { withTimezone: true }).notNull(),
  loadsCreated: integer("loads_created").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const brokerUsageRelations = relations(brokerUsage, ({ one }) => ({
  broker: one(brokers, {
    fields: [brokerUsage.brokerId],
    references: [brokers.id],
  }),
}));

// Stop Geofence State (anti-flap tracking for auto arrive/depart)
export const stopGeofenceState = pgTable("stop_geofence_state", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  stopId: uuid("stop_id").notNull().references(() => stops.id),
  driverId: uuid("driver_id").notNull().references(() => drivers.id),
  lastStatus: text("last_status"), // "inside" | "outside"
  insideStreak: integer("inside_streak").notNull().default(0),
  outsideStreak: integer("outside_streak").notNull().default(0),
  lastArriveAttemptAt: timestamp("last_arrive_attempt_at", { withTimezone: true }),
  lastDepartAttemptAt: timestamp("last_depart_attempt_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex("stop_geofence_state_stop_driver_idx").on(table.stopId, table.driverId),
]);

export const stopGeofenceStateRelations = relations(stopGeofenceState, ({ one }) => ({
  stop: one(stops, {
    fields: [stopGeofenceState.stopId],
    references: [stops.id],
  }),
  driver: one(drivers, {
    fields: [stopGeofenceState.driverId],
    references: [drivers.id],
  }),
}));

// Activity Log / Events model
export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // LOAD, DRIVER, BROKER, STOP
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(), // CREATED, UPDATED, STATUS_CHANGED, PING_RECEIVED, etc.
  actorType: text("actor_type").notNull(), // BROKER, DRIVER, SYSTEM, ADMIN
  actorId: uuid("actor_id"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  metadata: text("metadata"), // JSON string for extra context
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Admin Audit Log model
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  actorBrokerId: uuid("actor_broker_id").references(() => brokers.id),
  actorEmail: text("actor_email").notNull(),
  targetBrokerId: uuid("target_broker_id").references(() => brokers.id),
  action: text("action").notNull(), // ADD_CREDITS, BLOCK_USER, UPDATE_USAGE, etc.
  metadata: text("metadata"), // JSON string for details
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  actorBroker: one(brokers, {
    fields: [adminAuditLogs.actorBrokerId],
    references: [brokers.id],
  }),
}));

// Promotions model
export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  description: text("description"),
  discountType: text("discount_type").notNull(), // FIXED_LOAD_CREDITS, PERCENT_FIRST_SUBSCRIPTION, FIXED_FIRST_SUBSCRIPTION
  discountValue: integer("discount_value").notNull(),
  rewardLoads: integer("reward_loads").notNull().default(0), // Extra loads granted on redemption
  perUserLimit: integer("per_user_limit").default(1), // How many times a single user can redeem
  active: boolean("active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  maxRedemptions: integer("max_redemptions"),
  redemptionCount: integer("redemption_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Promotion Redemptions - tracks per-user redemption
export const promotionRedemptions = pgTable("promotion_redemptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  promotionId: uuid("promotion_id").notNull().references(() => promotions.id),
  brokerId: uuid("broker_id").notNull().references(() => brokers.id),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeInvoiceId: text("stripe_invoice_id"),
  loadsGranted: integer("loads_granted").notNull().default(0),
  discountApplied: boolean("discount_applied").notNull().default(false),
  status: text("status").notNull().default("PENDING"), // PENDING, COMPLETED, EXPIRED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Referrals model - tracks each referral relationship
export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: uuid("referrer_id").notNull().references(() => brokers.id),
  referredId: uuid("referred_id").references(() => brokers.id),
  referrerCode: text("referrer_code").notNull(), // The referral code used
  referredEmail: text("referred_email"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeInvoiceId: text("stripe_invoice_id"),
  referrerLoadsGranted: integer("referrer_loads_granted").notNull().default(0),
  referredLoadsGranted: integer("referred_loads_granted").notNull().default(0),
  status: text("status").notNull().default("REGISTERED"), // REGISTERED, PRO_SUBSCRIBED, REWARDS_GRANTED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(brokers, {
    fields: [referrals.referrerId],
    references: [brokers.id],
  }),
}));

// Insert schemas
export const insertBrokerSchema = createInsertSchema(brokers).pick({
  name: true,
  email: true,
  phone: true,
  timezone: true,
});

export const insertBrokerFieldHintSchema = createInsertSchema(brokerFieldHints).omit({
  id: true,
});

export const insertLoadSchema = createInsertSchema(loads, {
  rateAmount: z.string().or(z.number()),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStopSchema = createInsertSchema(stops).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDriverSchema = createInsertSchema(drivers).pick({
  phone: true,
});

export const insertTrackingPingSchema = createInsertSchema(trackingPings, {
  lat: z.string().or(z.number()),
  lng: z.string().or(z.number()),
  accuracy: z.string().or(z.number()).optional(),
  speed: z.string().or(z.number()).nullish(),
  heading: z.string().or(z.number()).nullish(),
}).omit({
  id: true,
  createdAt: true,
});

// Types
export type Broker = typeof brokers.$inferSelect;
export type InsertBroker = z.infer<typeof insertBrokerSchema>;
export type BrokerFieldHint = typeof brokerFieldHints.$inferSelect;
export type InsertBrokerFieldHint = z.infer<typeof insertBrokerFieldHintSchema>;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type BrokerDevice = typeof brokerDevices.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Load = typeof loads.$inferSelect;
export type InsertLoad = z.infer<typeof insertLoadSchema>;
export type Stop = typeof stops.$inferSelect;
export type InsertStop = z.infer<typeof insertStopSchema>;
export type TrackingPing = typeof trackingPings.$inferSelect;
export type InsertTrackingPing = z.infer<typeof insertTrackingPingSchema>;
export type RateConfirmationFile = typeof rateConfirmationFiles.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type BrokerEntitlement = typeof brokerEntitlements.$inferSelect;
export type BrokerCredit = typeof brokerCredits.$inferSelect;
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type StripePayment = typeof stripePayments.$inferSelect;
export type BrokerUsage = typeof brokerUsage.$inferSelect;
export type StopGeofenceState = typeof stopGeofenceState.$inferSelect;
export type SolanaPaymentIntent = typeof solanaPaymentIntents.$inferSelect;
export type InsertActivityLog = {
  entityType: string;
  entityId: string;
  action: string;
  actorType: string;
  actorId?: string;
  previousValue?: string;
  newValue?: string;
  metadata?: string;
};

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = {
  actorBrokerId?: string;
  actorEmail: string;
  targetBrokerId?: string;
  action: string;
  metadata?: string;
};

export type Promotion = typeof promotions.$inferSelect;
export type InsertPromotion = {
  code: string;
  description?: string;
  discountType: string;
  discountValue: number;
  rewardLoads?: number;
  perUserLimit?: number;
  active?: boolean;
  validFrom?: Date;
  validTo?: Date;
  maxRedemptions?: number;
};

export type PromotionRedemption = typeof promotionRedemptions.$inferSelect;
export type InsertPromotionRedemption = {
  promotionId: string;
  brokerId: string;
  stripeCheckoutSessionId?: string;
  stripeSubscriptionId?: string;
  stripeInvoiceId?: string;
  loadsGranted?: number;
  discountApplied?: boolean;
  status?: string;
};

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = {
  referrerId: string;
  referredId?: string;
  referrerCode: string;
  referredEmail?: string;
  stripeCheckoutSessionId?: string;
  stripeSubscriptionId?: string;
  stripeInvoiceId?: string;
  referrerLoadsGranted?: number;
  referredLoadsGranted?: number;
  status?: string;
};
