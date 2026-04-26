/**
 * Fire-and-forget sync of a load status change from PingPoint → AgentOS.
 * Used by both finalizeDelivery() (DELIVERED) and geofence transitions
 * (AT_PICKUP, AT_DELIVERY, IN_TRANSIT). Never throws — errors are logged.
 */

export type AgentOsSyncStatus =
  | "AT_PICKUP"
  | "AT_DELIVERY"
  | "IN_TRANSIT"
  | "DELIVERED_PENDING_BOL"
  | "DELIVERED";

export interface AgentOsSyncExtras {
  deliveredPendingAt?: Date | string | null;
  deliveredAt?: Date | string | null;
  bolStatus?: "received" | "missing";
  finalizeReason?: "bol_received" | "cron_timeout";
}

export function syncLoadStatusToAgentOS(
  customerRef: string | null | undefined,
  status: AgentOsSyncStatus,
  extras: AgentOsSyncExtras = {},
): void {
  if (!customerRef) {
    console.warn(`[LoadStatusSync] skipped status=${status} — no customer_ref`);
    return;
  }

  const apiKey = process.env.PINGPOINT_INTERNAL_KEY || process.env.INTERNAL_API_KEY;
  if (!apiKey) {
    console.warn(`[LoadStatusSync] PINGPOINT_INTERNAL_KEY not set — skipping ${customerRef} → ${status}`);
    return;
  }

  const baseUrl = (process.env.AGENTOS_API_BASE_URL || "https://agentos.suverse.io").replace(/\/$/, "");

  const body: Record<string, unknown> = {
    customer_ref: customerRef,
    status,
  };
  if (extras.deliveredPendingAt) {
    body.delivered_pending_at = toIso(extras.deliveredPendingAt);
  }
  if (extras.deliveredAt) {
    body.delivered_at = toIso(extras.deliveredAt);
  }
  if (extras.bolStatus) {
    body.bol_status = extras.bolStatus;
  }
  if (extras.finalizeReason) {
    body.finalize_reason = extras.finalizeReason;
  }

  // Fire and forget — caller does not await.
  void (async () => {
    try {
      const res = await fetch(`${baseUrl}/api/internal/loads-status-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        console.log(`[LoadStatusSync] sent customer_ref=${customerRef} status=${status}`);
      } else {
        console.error(`[LoadStatusSync] non-2xx ${res.status} customer_ref=${customerRef} status=${status}`);
      }
    } catch (err: any) {
      console.error(`[LoadStatusSync] failed customer_ref=${customerRef} status=${status}:`, err?.message || err);
    }
  })();
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}
