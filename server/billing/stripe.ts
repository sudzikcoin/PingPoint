import Stripe from "stripe";
import { db } from "../db";
import { stripeWebhookEvents, stripePayments, brokerEntitlements } from "@shared/schema";
import { eq } from "drizzle-orm";
import { grantCredits, ensureBrokerEntitlements, PRO_INCLUDED_LOADS, CYCLE_DAYS } from "./entitlements";

export const STRIPE_PRICE_EXTRA_LOAD = process.env.STRIPE_PRICE_EXTRA_LOAD || "";
export const STRIPE_PRICE_PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return null;
  }
  return new Stripe(key);
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

export async function createSubscriptionCheckoutSession(
  brokerId: string,
  brokerEmail: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  }
  if (!STRIPE_PRICE_PRO_MONTHLY) {
    throw new Error("STRIPE_PRICE_PRO_MONTHLY is not configured");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: brokerEmail,
    line_items: [
      {
        price: STRIPE_PRICE_PRO_MONTHLY,
        quantity: 1,
      },
    ],
    metadata: {
      brokerId,
      kind: "pro_subscription",
    },
    subscription_data: {
      metadata: {
        brokerId,
      },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session.url || "";
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return session.url;
}

export async function getStripeCustomerByEmail(email: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const customers = await stripe.customers.list({ email, limit: 1 });
  return customers.data[0]?.id || null;
}

async function upgradeToPro(brokerId: string, periodEnd: Date): Promise<void> {
  await ensureBrokerEntitlements(brokerId);
  
  await db
    .update(brokerEntitlements)
    .set({
      plan: "PRO",
      includedLoads: PRO_INCLUDED_LOADS,
      cycleEndAt: periodEnd,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(brokerEntitlements.brokerId, brokerId));

  console.log(`[Stripe] Upgraded broker ${brokerId} to PRO until ${periodEnd.toISOString()}`);
}

async function downgradeToFree(brokerId: string): Promise<void> {
  const now = new Date();
  const cycleEnd = new Date(now.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000);

  await db
    .update(brokerEntitlements)
    .set({
      plan: "FREE",
      includedLoads: 3,
      loadsUsed: 0,
      cycleStartAt: now,
      cycleEndAt: cycleEnd,
      status: "active",
      updatedAt: now,
    })
    .where(eq(brokerEntitlements.brokerId, brokerId));

  console.log(`[Stripe] Downgraded broker ${brokerId} to FREE`);
}

export async function processStripeEvent(event: Stripe.Event): Promise<{ processed: boolean; message: string }> {
  if (await isEventProcessed(event.id)) {
    return { processed: false, message: "Event already processed" };
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata || {};
    const brokerId = metadata.brokerId;

    if (session.mode === "subscription" && metadata.kind === "pro_subscription") {
      if (!brokerId) {
        return { processed: false, message: "Missing brokerId in metadata" };
      }

      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
      if (subscriptionId) {
        const stripe = getStripe();
        if (stripe) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const periodEnd = new Date((subscription as any).current_period_end * 1000);
          await upgradeToPro(brokerId, periodEnd);
        }
      }

      await db.insert(stripePayments).values({
        brokerId,
        checkoutSessionId: session.id,
        paymentIntentId: null,
        amount: session.amount_total || 9900,
        currency: session.currency || "usd",
        status: "completed",
        creditsGranted: 0,
      });

      await markEventProcessed(event.id, event.type);
      console.log(`[Stripe] Processed subscription checkout for broker ${brokerId}`);
      return { processed: true, message: "Subscription activated" };
    }

    if (session.mode === "payment" && metadata.kind === "extra_load_credits") {
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

    return { processed: false, message: "Unhandled checkout session type" };
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = (invoice as any).subscription;
    
    if (subscriptionId && typeof subscriptionId === 'string' && invoice.billing_reason === "subscription_cycle") {
      const stripe = getStripe();
      if (stripe) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const brokerId = (subscription as any).metadata?.brokerId;
        
        if (brokerId) {
          const periodEnd = new Date((subscription as any).current_period_end * 1000);
          await upgradeToPro(brokerId, periodEnd);
          
          await markEventProcessed(event.id, event.type);
          console.log(`[Stripe] Renewed PRO subscription for broker ${brokerId}`);
          return { processed: true, message: "Subscription renewed" };
        }
      }
    }

    return { processed: false, message: "Not a subscription renewal" };
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const brokerId = subscription.metadata?.brokerId;

    if (brokerId) {
      await downgradeToFree(brokerId);
      await markEventProcessed(event.id, event.type);
      console.log(`[Stripe] Subscription canceled for broker ${brokerId}`);
      return { processed: true, message: "Subscription canceled" };
    }

    return { processed: false, message: "Missing brokerId in subscription metadata" };
  }

  return { processed: false, message: "Unhandled event type" };
}
