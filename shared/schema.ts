import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, decimal, integer, uuid } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const brokersRelations = relations(brokers, ({ many }) => ({
  loads: many(loads),
  verificationTokens: many(verificationTokens),
  fieldHints: many(brokerFieldHints),
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

// Activity Log / Events model
export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // LOAD, DRIVER, BROKER, STOP
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(), // CREATED, UPDATED, STATUS_CHANGED, PING_RECEIVED, etc.
  actorType: text("actor_type").notNull(), // BROKER, DRIVER, SYSTEM
  actorId: uuid("actor_id"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  metadata: text("metadata"), // JSON string for extra context
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

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
