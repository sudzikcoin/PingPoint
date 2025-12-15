import Stripe from "stripe";
import { db } from "../db";
import { stripeWebhookEvents, stripePayments } from "@shared/schema";
import { eq } from "drizzle-orm";
import { grantCredits } from "./entitlements";

export const STRIPE_PRICE_EXTRA_LOAD = process.env.STRIPE_PRICE_EXTRA_LOAD || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return null;
  }
  return new Stripe(key, { apiVersion: "2025-04-30.basil" });
}

export async function createCheckoutSession(
  brokerId: string,
  quantity: number,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  }
  if (!STRIPE_PRICE_EXTRA_LOAD) {
    throw new Error("STRIPE_PRICE_EXTRA_LOAD is not configured");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price: STRIPE_PRICE_EXTRA_LOAD,
        quantity,
      },
    ],
    metadata: {
      brokerId,
      credits: String(quantity),
      kind: "extra_load_credits",
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session.url || "";
}

export async function verifyWebhookSignature(
  payload: Buffer,
  signature: string
): Promise<Stripe.Event> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}

export async function isEventProcessed(eventId: string): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, eventId));

  return !!existing;
}

export async function markEventProcessed(eventId: string, type: string): Promise<void> {
  await db.insert(stripeWebhookEvents).values({
    eventId,
    type,
  });
}

export async function processStripeEvent(event: Stripe.Event): Promise<{ processed: boolean; message: string }> {
  if (await isEventProcessed(event.id)) {
    return { processed: false, message: "Event already processed" };
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode !== "payment") {
      return { processed: false, message: "Not a payment session" };
    }

    const metadata = session.metadata || {};
    if (metadata.kind !== "extra_load_credits") {
      return { processed: false, message: "Not an extra load credits purchase" };
    }

    const brokerId = metadata.brokerId;
    const credits = parseInt(metadata.credits || "0", 10);

    if (!brokerId || credits <= 0) {
      return { processed: false, message: "Invalid metadata" };
    }

    await grantCredits(brokerId, credits, `stripe:${session.id}`);

    await db.insert(stripePayments).values({
      brokerId,
      checkoutSessionId: session.id,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      amount: session.amount_total || 0,
      currency: session.currency || "usd",
      status: "completed",
      creditsGranted: credits,
    });

    await markEventProcessed(event.id, event.type);

    console.log(`[Stripe] Processed checkout.session.completed: granted ${credits} credits to broker ${brokerId}`);
    return { processed: true, message: `Granted ${credits} credits` };
  }

  return { processed: false, message: "Unhandled event type" };
}
