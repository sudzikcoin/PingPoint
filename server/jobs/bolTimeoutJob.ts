import { db } from "../db";
import { loads } from "@shared/schema";
import { sql } from "drizzle-orm";
import { finalizeDelivery } from "../services/finalizeDelivery";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const TIMEOUT_HOURS = 30;
const RATE_LIMIT_MS = 5 * 1000;

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;

export function startBolTimeoutJob(): void {
  if (intervalId) return;
  console.log(`[BolTimeoutCron] started (interval=${CHECK_INTERVAL_MS / 1000}s, timeout=${TIMEOUT_HOURS}h)`);
  // Run once shortly after boot, then on interval.
  setTimeout(() => runBolTimeoutCheck().catch((err) => console.error("[BolTimeoutCron] initial run error:", err)), 30 * 1000);
  intervalId = setInterval(() => {
    runBolTimeoutCheck().catch((err) => console.error("[BolTimeoutCron] run error:", err));
  }, CHECK_INTERVAL_MS);
}

export function stopBolTimeoutJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[BolTimeoutCron] stopped");
  }
}

async function runBolTimeoutCheck(): Promise<void> {
  if (isRunning) {
    console.log("[BolTimeoutCron] previous run still in progress, skipping");
    return;
  }
  isRunning = true;
  const startedAt = Date.now();

  try {
    // Atomic flip: claim all expired DELIVERED_PENDING_BOL loads in one statement.
    const result = await db.execute<{ id: string; customer_ref: string | null; driver_id: string | null }>(
      sql`
        UPDATE loads
        SET status = 'DELIVERED',
            bol_missing = true,
            delivered_at = NOW(),
            updated_at = NOW()
        WHERE status = 'DELIVERED_PENDING_BOL'
          AND delivered_pending_at < NOW() - INTERVAL '${sql.raw(String(TIMEOUT_HOURS))} hours'
        RETURNING id, customer_ref, driver_id
      `,
    );

    const rows = (result as any).rows ?? result;
    const claimed: Array<{ id: string }> = Array.isArray(rows) ? rows : [];

    if (claimed.length === 0) {
      return;
    }

    console.log(`[BolTimeoutCron] claimed ${claimed.length} expired load(s)`);

    let processed = 0;
    for (const row of claimed) {
      try {
        await finalizeDelivery(row.id, "cron_timeout");
        processed++;
      } catch (err: any) {
        console.error(`[BolTimeoutCron] finalizeDelivery failed for load=${row.id}:`, err?.message || err);
      }
      // Rate limit: 1 finalize per 5s, even if many timed out at once.
      if (processed < claimed.length) {
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }
    }

    console.log(`[BolTimeoutCron] processed ${processed}/${claimed.length} loads in ${Date.now() - startedAt}ms`);
  } finally {
    isRunning = false;
  }
}
