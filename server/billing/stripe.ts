import Stripe from "stripe";
import { db } from "../db";
import { stripeWebhookEvents, stripePayments, brokerEntitlements, referrals, promotions, promotionRedemptions, adminAuditLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { grantCredits, ensureBrokerEntitlements, PRO_INCLUDED_LOADS, CYCLE_DAYS } from "./entitlements";

export const STRIPE_PRICE_EXTRA_LOAD = process.env.STRIPE_PRICE_EXTRA_CREDIT || process.env.STRIPE_PRICE_EXTRA_LOAD || "";
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
  cancelUrl: string,
  promoCode?: string
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
      promoCode: promoCode || "",
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
  if (!stripe) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  }

  const customers = await stripe.customers.list({ email, limit: 1 });
  return customers.data[0]?.id || null;
}

// Referral reward constants
const REFERRER_REWARD_LOADS = 20;
const REFERRED_REWARD_LOADS = 10;

async function processPromoCodeRedemption(
  brokerId: string,
  promoCode: string,
  stripeSessionId: string
): Promise<void> {
  if (!promoCode) return;

  try {
    // Find the promotion
    const [promo] = await db
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.code, promoCode.toUpperCase()),
          eq(promotions.active, true)
        )
      );

    if (!promo) {
      console.log(`[Promo] Promo code "${promoCode}" not found or inactive`);
      return;
    }

    // Check if already redeemed
    const [existingRedemption] = await db
      .select()
      .from(promotionRedemptions)
      .where(
        and(
          eq(promotionRedemptions.promotionId, promo.id),
          eq(promotionRedemptions.brokerId, brokerId)
        )
      );

    if (existingRedemption) {
      console.log(`[Promo] Broker ${brokerId} already redeemed promo ${promoCode}`);
      return;
    }

    // Record the redemption
    await db.insert(promotionRedemptions).values({
      promotionId: promo.id,
      brokerId,
      stripeCheckoutSessionId: stripeSessionId,
      loadsGranted: promo.rewardLoads || 0,
      status: "COMPLETED",
    });

    // Update promotion total redemption count
    await db
      .update(promotions)
      .set({
        redemptionCount: (promo.redemptionCount || 0) + 1,
      })
      .where(eq(promotions.id, promo.id));

    // Grant bonus loads if applicable
    if (promo.rewardLoads && promo.rewardLoads > 0) {
      await grantCredits(brokerId, promo.rewardLoads, `promo:${promo.code}:${stripeSessionId}`);
      console.log(`[Promo] Granted ${promo.rewardLoads} loads to broker ${brokerId} for promo ${promoCode}`);
    }

    console.log(`[Promo] Recorded redemption of "${promoCode}" by broker ${brokerId}`);
  } catch (error: any) {
    // Don't fail the whole webhook if promo processing fails
    console.error(`[Promo] Error processing promo code redemption:`, error.message);
  }
}

async function grantReferralRewards(
  referredBrokerId: string,
  stripeSessionId: string | null,
  stripeSubscriptionId: string | null
): Promise<void> {
  try {
    // Check if there's a pending referral for this broker
    const [pendingReferral] = await db
      .select()
      .from(referrals)
      .where(
        and(
          eq(referrals.referredId, referredBrokerId),
          eq(referrals.status, "REGISTERED")
        )
      );

    if (!pendingReferral) {
      console.log(`[Referral] No pending referral found for broker ${referredBrokerId}`);
      return;
    }

    console.log(`[Referral] Granting rewards for referral: referrer=${pendingReferral.referrerId}, referred=${referredBrokerId}`);

    // Grant credits to referrer (20 loads)
    await grantCredits(pendingReferral.referrerId, REFERRER_REWARD_LOADS, `referral:${pendingReferral.id}`);
    
    // Grant credits to referred user (10 loads)
    await grantCredits(referredBrokerId, REFERRED_REWARD_LOADS, `referred:${pendingReferral.id}`);

    // Update referral status
    await db
      .update(referrals)
      .set({
        status: "REWARDS_GRANTED",
        stripeCheckoutSessionId: stripeSessionId,
        stripeSubscriptionId,
        referrerLoadsGranted: REFERRER_REWARD_LOADS,
        referredLoadsGranted: REFERRED_REWARD_LOADS,
      })
      .where(eq(referrals.id, pendingReferral.id));

    // Log the referral reward to admin audit log
    await db.insert(adminAuditLogs).values({
      actorEmail: "system",
      action: "REFERRAL_REWARDS_GRANTED",
      targetBrokerId: referredBrokerId,
      metadata: JSON.stringify({
        referralId: pendingReferral.id,
        referrerId: pendingReferral.referrerId,
        referredId: referredBrokerId,
        referrerLoads: REFERRER_REWARD_LOADS,
        referredLoads: REFERRED_REWARD_LOADS,
        stripeSessionId,
        stripeSubscriptionId,
      }),
    });

    console.log(`[Referral] Granted ${REFERRER_REWARD_LOADS} loads to referrer ${pendingReferral.referrerId} and ${REFERRED_REWARD_LOADS} loads to ${referredBrokerId}`);
  } catch (error: any) {
    // Don't fail the whole webhook if referral granting fails
    console.error(`[Referral] Error granting referral rewards:`, error.message);
  }
}

async function upgradeToPro(brokerId: string, periodEnd: Date): Promise<void> {
  await ensureBrokerEntitlements(brokerId);
  
  const now = new Date();
  await db
    .update(brokerEntitlements)
    .set({
      plan: "PRO",
      includedLoads: PRO_INCLUDED_LOADS,
      loadsUsed: 0,
      cycleStartAt: now,
      cycleEndAt: periodEnd,
      status: "active",
      updatedAt: now,
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
  console.log(`[Stripe Webhook] Processing event: ${event.type}`);
  
  if (await isEventProcessed(event.id)) {
    return { processed: false, message: "Event already processed" };
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata || {};
    const brokerId = metadata.brokerId;
    
    console.log(`[Stripe Webhook] checkout.session.completed: mode=${session.mode}, kind=${metadata.kind}, brokerId=${brokerId}`);

    if (session.mode === "subscription") {
      if (!brokerId) {
        console.log(`[Stripe Webhook] Missing brokerId in subscription checkout metadata`);
        return { processed: false, message: "Missing brokerId in metadata" };
      }

      try {
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
        let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days from now
        
        if (subscriptionId) {
          const stripe = getStripe();
          if (stripe) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const rawPeriodEnd = (subscription as any).current_period_end;
            if (rawPeriodEnd && typeof rawPeriodEnd === 'number') {
              periodEnd = new Date(rawPeriodEnd * 1000);
            }
          }
        }
        
        // Validate the date
        if (isNaN(periodEnd.getTime())) {
          periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        
        await upgradeToPro(brokerId, periodEnd);

        await db.insert(stripePayments).values({
          brokerId,
          checkoutSessionId: session.id,
          paymentIntentId: null,
          amount: session.amount_total || 9900,
          currency: session.currency || "usd",
          status: "completed",
          creditsGranted: 0,
        });

        // Check and grant referral rewards
        await grantReferralRewards(brokerId, session.id, subscriptionId);

        // Process promo code if provided
        const promoCode = metadata.promoCode;
        if (promoCode) {
          await processPromoCodeRedemption(brokerId, promoCode, session.id);
        }

        await markEventProcessed(event.id, event.type);
        console.log(`[Stripe Webhook] Subscription activated for broker ${brokerId}`);
        return { processed: true, message: "Subscription activated" };
      } catch (err: any) {
        console.error(`[Stripe Webhook] Error processing subscription checkout:`, err.message);
        throw err;
      }
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
      console.log(`[Stripe Webhook] Granted ${credits} credits to broker ${brokerId}`);
      return { processed: true, message: `Granted ${credits} credits` };
    }

    console.log(`[Stripe Webhook] Unhandled checkout session: mode=${session.mode}, kind=${metadata.kind}`);
    return { processed: false, message: "Unhandled checkout session type" };
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = (invoice as any).subscription;
    const billingReason = invoice.billing_reason;
    
    console.log(`[Stripe Webhook] invoice.paid: billing_reason=${billingReason}, subscriptionId=${subscriptionId}`);
    
    // Handle both initial subscription creation and renewals
    if (subscriptionId && typeof subscriptionId === 'string' && 
        (billingReason === "subscription_cycle" || billingReason === "subscription_create")) {
      const stripe = getStripe();
      if (stripe) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const brokerId = (subscription as any).metadata?.brokerId;
          
          if (brokerId) {
            const rawPeriodEnd = (subscription as any).current_period_end;
            let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            
            if (rawPeriodEnd && typeof rawPeriodEnd === 'number') {
              periodEnd = new Date(rawPeriodEnd * 1000);
            }
            
            if (isNaN(periodEnd.getTime())) {
              periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            }
            
            await upgradeToPro(brokerId, periodEnd);
            
            await markEventProcessed(event.id, event.type);
            const action = billingReason === "subscription_create" ? "created" : "renewed";
            console.log(`[Stripe Webhook] PRO subscription ${action} for broker ${brokerId}`);
            return { processed: true, message: `Subscription ${action}` };
          } else {
            console.log(`[Stripe Webhook] invoice.paid: No brokerId in subscription metadata`);
          }
        } catch (err: any) {
          console.error(`[Stripe Webhook] Error processing invoice.paid:`, err.message);
          throw err;
        }
      }
    }

    console.log(`[Stripe Webhook] invoice.paid: Not a subscription event we handle`);
    return { processed: false, message: "Not a subscription renewal" };
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const brokerId = subscription.metadata?.brokerId;

    if (brokerId) {
      await downgradeToFree(brokerId);
      await markEventProcessed(event.id, event.type);
      console.log(`[Stripe Webhook] Subscription canceled for broker ${brokerId}`);
      return { processed: true, message: "Subscription canceled" };
    }

    return { processed: false, message: "Missing brokerId in subscription metadata" };
  }

  console.log(`[Stripe Webhook] ${event.type}: Unhandled event type`);
  return { processed: false, message: "Unhandled event type" };
}
