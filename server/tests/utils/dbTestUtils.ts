import { db } from "../../db";
import { brokers, verificationTokens, drivers, loads, stops, trackingPings } from "@shared/schema";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";

export async function resetDatabase() {
  // Use TRUNCATE CASCADE to handle all FK constraints automatically
  await db.execute(sql`TRUNCATE TABLE 
    stop_geofence_state,
    tracking_pings,
    stops,
    stripe_payments,
    exception_events,
    webhook_delivery_logs,
    webhook_configs,
    rate_confirmation_files,
    driver_reward_transactions,
    driver_reward_accounts,
    loads,
    verification_tokens,
    broker_field_hints,
    broker_devices,
    broker_entitlements,
    broker_credits,
    broker_usage,
    stripe_webhook_events,
    solana_payment_intents,
    notification_preferences,
    promotion_redemptions,
    referrals,
    shippers,
    receivers,
    activity_logs,
    drivers,
    brokers
    CASCADE`);
}

export async function createTestBroker(options: {
  email?: string;
  name?: string;
  emailVerified?: boolean;
} = {}) {
  const [broker] = await db.insert(brokers).values({
    email: options.email || `test-${randomUUID()}@example.com`,
    name: options.name || "Test Broker",
    emailVerified: options.emailVerified ?? false,
    phone: null,
    timezone: null,
  }).returning();
  return broker;
}

export async function createTestDriver(options: {
  phone?: string;
} = {}) {
  const [driver] = await db.insert(drivers).values({
    phone: options.phone || "+1555555" + Math.floor(Math.random() * 10000).toString().padStart(4, "0"),
  }).returning();
  return driver;
}

export async function createTestLoad(options: {
  brokerId: string;
  driverId?: string;
  status?: string;
  customerRef?: string;
} = { brokerId: "" }) {
  const loadNumber = `LD-TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const trackingToken = `trk_${randomUUID().replace(/-/g, "").substring(0, 24)}`;
  const driverToken = `drv_${randomUUID().replace(/-/g, "").substring(0, 24)}`;

  const [load] = await db.insert(loads).values({
    brokerId: options.brokerId,
    driverId: options.driverId || null,
    loadNumber,
    shipperName: "Test Shipper",
    carrierName: "Test Carrier",
    equipmentType: "DRY VAN",
    customerRef: options.customerRef || `REF-${Date.now()}`,
    rateAmount: "1500.00",
    status: options.status || "PLANNED",
    trackingToken,
    driverToken,
    pickupEta: null,
    deliveryEta: null,
    billingMonth: new Date(),
    isBillable: true,
  }).returning();

  return load;
}

export async function createTestStop(options: {
  loadId: string;
  type: "PICKUP" | "DELIVERY";
  sequence: number;
  status?: string;
  lat?: string;
  lng?: string;
  geofenceRadiusM?: number;
}) {
  const [stop] = await db.insert(stops).values({
    loadId: options.loadId,
    type: options.type,
    sequence: options.sequence,
    name: `Test ${options.type} Location`,
    fullAddress: "123 Test St, Test City, TX 75001",
    city: "Test City",
    state: "TX",
    lat: options.lat || null,
    lng: options.lng || null,
    geofenceRadiusM: options.geofenceRadiusM || 300,
    windowFrom: null,
    windowTo: null,
    arrivedAt: null,
    departedAt: null,
  }).returning();

  return stop;
}

export async function createTestVerificationToken(options: {
  brokerId: string;
  used?: boolean;
  expiresAt?: Date;
}) {
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

  const [verificationToken] = await db.insert(verificationTokens).values({
    brokerId: options.brokerId,
    token,
    expiresAt: options.expiresAt || new Date(Date.now() + 48 * 60 * 60 * 1000),
    used: options.used ?? false,
  }).returning();

  return verificationToken;
}

export async function createTestTrackingPing(options: {
  loadId: string;
  driverId: string;
  lat: string;
  lng: string;
}) {
  const [ping] = await db.insert(trackingPings).values({
    loadId: options.loadId,
    driverId: options.driverId,
    lat: options.lat,
    lng: options.lng,
    accuracy: "10.00",
    source: "TEST",
  }).returning();

  return ping;
}
