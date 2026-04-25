import { createHmac } from "node:crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../utils/logger";

/**
 * Forward tracking_pings → AgentOS as HMAC-signed webhook batches.
 * Strategy: poll new pings since last forwarded created_at, batch by 200,
 * POST signed payload, advance marker on 200 OK. Failures retry next tick.
 *
 * State persisted in webhook_forward_state(name TEXT PK, last_value TEXT).
 * Self-creates the table on first run.
 */

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 200;
const STATE_KEY = "agentos_telemetry_last_ts";
const REQUEST_TIMEOUT_MS = 15_000;

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;
let lastRunAt: Date | null = null;
let totalForwarded = 0;

export function getAgentOsForwarderStatus() {
  return {
    enabled: intervalId !== null,
    running: isRunning,
    lastRunAt: lastRunAt?.toISOString() ?? null,
    totalForwarded,
  };
}

async function ensureStateTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS webhook_forward_state (
      name TEXT PRIMARY KEY,
      last_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getLastTs(): Promise<string> {
  const r = await db.execute(sql`SELECT last_value FROM webhook_forward_state WHERE name = ${STATE_KEY} LIMIT 1`);
  const row = (r.rows as any[])[0];
  if (row?.last_value) return row.last_value as string;
  // Bootstrap: start from now() so we don't deluge AgentOS with historical
  // pings. Backfill is handled separately via the AgentOS-side script.
  const initial = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO webhook_forward_state (name, last_value)
    VALUES (${STATE_KEY}, ${initial})
    ON CONFLICT (name) DO NOTHING
  `);
  return initial;
}

async function setLastTs(ts: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO webhook_forward_state (name, last_value, updated_at)
    VALUES (${STATE_KEY}, ${ts}, now())
    ON CONFLICT (name) DO UPDATE SET last_value = EXCLUDED.last_value, updated_at = now()
  `);
}

interface OutboundPing {
  pingId: string;
  loadNumber: string;
  customerRef: string | null;
  truckNumber: string | null;
  timestamp: string;
  lat: number;
  lng: number;
  speedKph: number | null;
  heading: number | null;
  rpm: number | null;
  gear: number | null;
  wheelSpeedKph: number | null;
  fuelRateGph: number | null;
  totalFuelGalSession: number | null;
  engineHours: number | null;
  odometerMiles: number | null;
  source: string;
}

async function fetchBatch(sinceTs: string): Promise<OutboundPing[]> {
  // join load + driver to pull loadNumber + truck_number; only forward pings
  // whose load has a known load_number (avoids orphan inserts on AgentOS).
  const r = await db.execute(sql`
    SELECT tp.id::text AS ping_id,
           tp.created_at,
           tp.lat::float8 AS lat,
           tp.lng::float8 AS lng,
           tp.speed::float8 AS speed_ms,
           tp.heading::float8 AS heading,
           tp.rpm,
           tp.current_gear AS gear,
           tp.wheel_speed_kph::float8 AS wheel_speed_kph,
           tp.fuel_rate_gph::float8 AS fuel_rate_gph,
           tp.total_fuel_gal::float8 AS total_fuel_gal,
           tp.engine_hours::float8 AS engine_hours,
           tp.odometer_miles::float8 AS odometer_miles,
           tp.source,
           l.load_number,
           l.customer_ref,
           d.truck_number
    FROM tracking_pings tp
    JOIN loads l ON tp.load_id = l.id
    LEFT JOIN drivers d ON tp.driver_id = d.id
    WHERE tp.created_at > ${sinceTs}::timestamptz
    ORDER BY tp.created_at ASC
    LIMIT ${BATCH_SIZE}
  `);
  return (r.rows as any[]).map((row) => ({
    pingId: row.ping_id,
    loadNumber: row.load_number,
    customerRef: row.customer_ref || null,
    truckNumber: row.truck_number || null,
    timestamp: new Date(row.created_at).toISOString(),
    lat: Number(row.lat),
    lng: Number(row.lng),
    speedKph: row.speed_ms != null ? +(row.speed_ms * 3.6).toFixed(2) : null,
    heading: row.heading != null ? Math.round(Number(row.heading)) : null,
    rpm: row.rpm != null ? Number(row.rpm) : null,
    gear: row.gear != null ? Number(row.gear) : null,
    wheelSpeedKph: row.wheel_speed_kph != null ? Number(row.wheel_speed_kph) : null,
    fuelRateGph: row.fuel_rate_gph != null ? Number(row.fuel_rate_gph) : null,
    totalFuelGalSession: row.total_fuel_gal != null ? Number(row.total_fuel_gal) : null,
    engineHours: row.engine_hours != null ? Number(row.engine_hours) : null,
    odometerMiles: row.odometer_miles != null ? Number(row.odometer_miles) : null,
    source: row.source === "IOSIX_RAW" ? "pingpoint_pt30" : "pingpoint_driver_app",
  }));
}

async function postWebhook(path: string, body: object): Promise<{ ok: boolean; status: number }> {
  const baseUrl = (process.env.AGENTOS_API_BASE_URL || "https://agentos.suverse.io").replace(/\/$/, "");
  const secret = process.env.AGENTOS_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("[AgentOsForwarder] AGENTOS_WEBHOOK_SECRET not set — skipping");
    return { ok: false, status: 0 };
  }
  const raw = JSON.stringify(body);
  const sig = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-pingpoint-signature": sig },
      body: raw,
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    logger.warn(`[AgentOsForwarder] POST ${path} failed: ${e?.message || e}`);
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function forwardLoadCompleted(loadNumber: string): Promise<void> {
  await postWebhook("/api/webhooks/pingpoint/load-completed", { loadNumber });
}

async function tick(): Promise<void> {
  if (isRunning) return;
  if (!process.env.AGENTOS_WEBHOOK_SECRET) return; // disabled
  isRunning = true;
  try {
    await ensureStateTable();
    const sinceTs = await getLastTs();
    const pings = await fetchBatch(sinceTs);
    if (pings.length === 0) return;
    const result = await postWebhook("/api/webhooks/pingpoint/telemetry", { pings });
    if (result.ok) {
      const newest = pings[pings.length - 1].timestamp;
      await setLastTs(newest);
      totalForwarded += pings.length;
      logger.info(`[AgentOsForwarder] Forwarded ${pings.length} pings, marker → ${newest}`);
    } else {
      logger.warn(`[AgentOsForwarder] Forward failed (${result.status}); retry next tick`);
    }
  } catch (e: any) {
    logger.warn(`[AgentOsForwarder] Tick error: ${e?.message || e}`);
  } finally {
    lastRunAt = new Date();
    isRunning = false;
  }
}

export function startAgentOsForwarder(): void {
  if (intervalId) return;
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
  // First run after 5s to give the server time to settle.
  setTimeout(tick, 5_000);
  logger.info(`[AgentOsForwarder] Started — polling every ${POLL_INTERVAL_MS / 1000}s`);
}

export function stopAgentOsForwarder(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
