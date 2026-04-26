import { db } from "../db";
import { loads, trackingPings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { syncLoadStatusToAgentOS } from "./agentosStatusSync";

export type FinalizeReason = "bol_received" | "cron_timeout";

/**
 * Final-stage handler for a delivered load. Caller must have already flipped
 * loads.status → 'DELIVERED' (and set delivered_at, bol_missing, etc.) before
 * calling this. Fires AgentOS status sync + AgentOS delivery webhook (CO2,
 * Solana, Telegram).
 */
export async function finalizeDelivery(
  loadId: string,
  reason: FinalizeReason,
): Promise<void> {
  const startedAt = Date.now();

  const [load] = await db.select().from(loads).where(eq(loads.id, loadId));
  if (!load) {
    console.warn(`[Finalize] load=${loadId} not found`);
    return;
  }
  if (load.status !== "DELIVERED") {
    console.warn(
      `[Finalize] load=${loadId.substring(0, 8)} status=${load.status} (expected DELIVERED) — skipping`,
    );
    return;
  }

  syncLoadStatusToAgentOS(load.customerRef, "DELIVERED", {
    deliveredAt: load.deliveredAt,
    bolStatus: load.bolMissing ? "missing" : "received",
    finalizeReason: reason,
  });

  await sendAgentOsDeliveryWebhook(loadId, reason);

  console.log(
    `[Finalize] load=${loadId.substring(0, 8)} reason=${reason} duration=${Date.now() - startedAt}ms`,
  );
}

async function sendAgentOsDeliveryWebhook(
  loadId: string,
  reason: FinalizeReason,
): Promise<void> {
  const agentosUrl = process.env.AGENTOS_API_BASE_URL || "https://agentos.suverse.io";
  const internalKey = process.env.INTERNAL_API_KEY || process.env.PINGPOINT_INTERNAL_KEY;
  if (!internalKey) {
    console.warn("[Finalize] INTERNAL_API_KEY not set — skipping AgentOS delivery webhook");
    return;
  }

  try {
    const [load] = await db.select().from(loads).where(eq(loads.id, loadId));
    if (!load) return;

    const allPings = await db
      .select({ lat: trackingPings.lat, lng: trackingPings.lng, ts: trackingPings.createdAt })
      .from(trackingPings)
      .where(eq(trackingPings.loadId, loadId))
      .orderBy(trackingPings.createdAt);

    const gpsTrack = allPings.map((p) => ({
      lat: parseFloat(p.lat),
      lng: parseFloat(p.lng),
      ts: p.ts instanceof Date ? p.ts.toISOString() : String(p.ts),
    }));

    const meta = (load.metadata && typeof load.metadata === "object" && !Array.isArray(load.metadata))
      ? (load.metadata as Record<string, unknown>)
      : {};
    const deliveryPreview = (meta.delivery_preview && typeof meta.delivery_preview === "object")
      ? meta.delivery_preview
      : null;

    const payload = {
      pingpointLoadId: load.id,
      pingpointLoadNumber: load.loadNumber,
      customerRef: load.customerRef,
      driverToken: load.driverToken,
      deliveredAt: load.deliveredAt
        ? (load.deliveredAt instanceof Date
            ? load.deliveredAt.toISOString()
            : String(load.deliveredAt))
        : new Date().toISOString(),
      bolMissing: load.bolMissing === true,
      bolStatus: load.bolMissing ? "missing" : "received",
      finalizeReason: reason,
      // Precomputed by Block F deliveryMetricsService at AT_DELIVERY time.
      // AgentOS may use this for fast reporting without recomputing from gpsTrack.
      deliveryPreview,
      gpsTrack,
      pingCount: gpsTrack.length,
    };

    const res = await fetch(`${agentosUrl}/api/internal/pingpoint-delivery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": internalKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      console.log(
        `[Finalize] AgentOS delivery webhook sent load=${load.loadNumber} pings=${gpsTrack.length} reason=${reason}`,
      );
    } else {
      console.warn(`[Finalize] AgentOS delivery webhook non-2xx: ${res.status}`);
    }
  } catch (err: any) {
    console.warn(`[Finalize] AgentOS delivery webhook failed:`, err?.message || err);
  }
}
