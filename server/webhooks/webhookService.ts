import crypto from "crypto";
import { db } from "../db";
import { 
  webhookConfigs, 
  webhookDeliveryLogs, 
  brokers, 
  loads, 
  stops,
  type WebhookConfig,
  type WebhookDeliveryLog,
} from "@shared/schema";
import { eq } from "drizzle-orm";

export type WebhookEventType = 
  | "pingpoint.load.created"
  | "pingpoint.load.updated"
  | "pingpoint.status.changed"
  | "pingpoint.load.completed";

export async function getOrCreateWebhookConfigForUser(brokerId: string): Promise<WebhookConfig> {
  const [existing] = await db
    .select()
    .from(webhookConfigs)
    .where(eq(webhookConfigs.brokerId, brokerId));

  if (existing) {
    return existing;
  }

  const secret = crypto.randomBytes(32).toString("hex");

  const [config] = await db
    .insert(webhookConfigs)
    .values({
      brokerId,
      secret,
      enabled: false,
      url: null,
    })
    .returning();

  return config;
}

export async function updateWebhookConfigForUser(
  brokerId: string,
  updates: { enabled?: boolean; url?: string | null }
): Promise<WebhookConfig> {
  const config = await getOrCreateWebhookConfigForUser(brokerId);

  if (updates.url !== undefined && updates.url !== null && updates.url !== "") {
    try {
      const parsed = new URL(updates.url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("URL must use http or https protocol");
      }
    } catch (e: any) {
      throw new Error(`Invalid webhook URL: ${e.message}`);
    }
  }

  if (updates.enabled === true && (!updates.url && !config.url)) {
    throw new Error("Cannot enable webhooks without a valid URL");
  }

  const updateData: Partial<WebhookConfig> = {
    updatedAt: new Date(),
  };

  if (updates.enabled !== undefined) {
    updateData.enabled = updates.enabled;
  }

  if (updates.url !== undefined) {
    updateData.url = updates.url || null;
    if (config.url && updates.url && config.url !== updates.url) {
      updateData.secret = crypto.randomBytes(32).toString("hex");
    }
  }

  const [updated] = await db
    .update(webhookConfigs)
    .set(updateData)
    .where(eq(webhookConfigs.id, config.id))
    .returning();

  return updated;
}

interface EmitLoadEventParams {
  brokerId: string;
  loadId: string;
  eventType: WebhookEventType;
  previousStatus?: string | null;
}

export async function emitLoadEvent(params: EmitLoadEventParams): Promise<void> {
  const { brokerId, loadId, eventType, previousStatus } = params;

  try {
    const [config] = await db
      .select()
      .from(webhookConfigs)
      .where(eq(webhookConfigs.brokerId, brokerId));

    if (!config || !config.enabled || !config.url) {
      return;
    }

    const [broker] = await db
      .select()
      .from(brokers)
      .where(eq(brokers.id, brokerId));

    if (!broker) {
      console.error(`[Webhook] Broker not found: ${brokerId}`);
      return;
    }

    const [load] = await db
      .select()
      .from(loads)
      .where(eq(loads.id, loadId));

    if (!load) {
      console.error(`[Webhook] Load not found: ${loadId}`);
      return;
    }

    const loadStops = await db
      .select()
      .from(stops)
      .where(eq(stops.loadId, loadId))
      .orderBy(stops.sequence);

    const payload = {
      event: eventType,
      version: "1.0",
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      account: {
        userId: broker.id,
        email: broker.email,
        name: broker.name || null,
      },
      data: {
        loadId: load.id,
        loadNumber: load.loadNumber,
        reference: load.customerRef || null,
        status: load.status || null,
        previousStatus: previousStatus || null,
        rateAmount: load.rateAmount || null,
        currency: "USD",
        equipmentType: load.equipmentType || null,
        shipperName: load.shipperName || null,
        carrierName: load.carrierName || null,
        stops: loadStops.map((s) => ({
          sequence: s.sequence,
          type: s.type,
          facilityName: s.name,
          city: s.city,
          state: s.state,
          windowFrom: s.windowFrom?.toISOString() || null,
          windowTo: s.windowTo?.toISOString() || null,
          arrivedAt: s.arrivedAt?.toISOString() || null,
          departedAt: s.departedAt?.toISOString() || null,
        })),
      },
    };

    const body = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", config.secret).update(body).digest("hex");

    const startTime = Date.now();
    let statusCode: number | null = null;
    let errorMessage: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "PingPoint Webhook/1.0",
          "X-PingPoint-Event": eventType,
          "X-PingPoint-Signature": signature,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      statusCode = response.status;

      if (!response.ok) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (e: any) {
      errorMessage = e.name === "AbortError" ? "Request timeout (5s)" : e.message?.substring(0, 500);
    }

    const durationMs = Date.now() - startTime;

    await db.insert(webhookDeliveryLogs).values({
      brokerId,
      eventType,
      targetUrl: config.url,
      statusCode,
      errorMessage,
      durationMs,
    });

    await db
      .update(webhookConfigs)
      .set({ lastDeliveryAt: new Date() })
      .where(eq(webhookConfigs.id, config.id));

    if (errorMessage) {
      console.error(`[Webhook] Delivery failed for ${eventType}: ${errorMessage}`);
    } else {
      console.log(`[Webhook] Delivered ${eventType} to ${config.url} (${durationMs}ms)`);
    }
  } catch (e: any) {
    console.error(`[Webhook] Error in emitLoadEvent: ${e.message}`);
  }
}
