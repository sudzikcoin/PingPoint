import { db } from "../db";
import { solanaPaymentIntents, brokerEntitlements } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { Connection, PublicKey, Keypair, clusterApiUrl } from "@solana/web3.js";
import { encodeURL, findReference, validateTransfer } from "@solana/pay";
import BigNumber from "bignumber.js";

// Configuration from environment
export const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
export const SOLANA_MERCHANT_WALLET = process.env.SOLANA_MERCHANT_WALLET;
export const SOLANA_USDC_MINT = process.env.SOLANA_USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOLANA_PAY_LABEL = process.env.SOLANA_PAY_LABEL || "PingPoint";
export const SOLANA_PAY_MESSAGE = process.env.SOLANA_PAY_MESSAGE || "PingPoint Pro - 30 days / 200 loads";

// Plan constants
export const PRO_PLAN_PRICE_USDC = 99;
export const PRO_PLAN_PRICE_BASE_UNITS = "99000000"; // 99 USDC with 6 decimals
export const PRO_INCLUDED_LOADS = 200;
export const PRO_CYCLE_DAYS = 30;

// Intent expiration (30 minutes)
const INTENT_EXPIRATION_MS = 30 * 60 * 1000;

export function getSolanaConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}

export function getMerchantWallet(): PublicKey {
  if (!SOLANA_MERCHANT_WALLET) {
    throw new Error("SOLANA_MERCHANT_WALLET environment variable is required for Solana payments");
  }
  return new PublicKey(SOLANA_MERCHANT_WALLET);
}

export function getUsdcMint(): PublicKey {
  return new PublicKey(SOLANA_USDC_MINT);
}

export interface CreateIntentResult {
  intentId: string;
  solanaPayUrl: string;
  reference: string;
  amount: string;
  token: string;
  expiresAt: Date;
}

export async function createProPaymentIntent(brokerId: string): Promise<CreateIntentResult> {
  // Generate unique reference keypair
  const referenceKeypair = Keypair.generate();
  const reference = referenceKeypair.publicKey;
  
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INTENT_EXPIRATION_MS);
  
  // Create the Solana Pay URL
  const merchantWallet = getMerchantWallet();
  const usdcMint = getUsdcMint();
  
  const url = encodeURL({
    recipient: merchantWallet,
    amount: new BigNumber(PRO_PLAN_PRICE_USDC),
    splToken: usdcMint,
    reference: reference,
    label: SOLANA_PAY_LABEL,
    message: SOLANA_PAY_MESSAGE,
  });
  
  // Store intent in database
  const [intent] = await db
    .insert(solanaPaymentIntents)
    .values({
      brokerId,
      planCode: "PRO",
      amountBaseUnits: PRO_PLAN_PRICE_BASE_UNITS,
      reference: reference.toBase58(),
      status: "PENDING",
      expiresAt,
    })
    .returning();
  
  console.log(`[Solana] Created PRO payment intent ${intent.id} for broker ${brokerId}`);
  
  return {
    intentId: intent.id,
    solanaPayUrl: url.toString(),
    reference: reference.toBase58(),
    amount: PRO_PLAN_PRICE_USDC.toString(),
    token: "USDC",
    expiresAt,
  };
}

export interface IntentStatus {
  id: string;
  status: "PENDING" | "CONFIRMED" | "EXPIRED";
  planCode: string;
  signature?: string;
  confirmedAt?: Date;
  expiresAt: Date;
  planInfo?: {
    planCode: string;
    includedLoads: number;
    cycleEndAt: Date;
  };
}

export async function checkAndConfirmIntent(intentId: string, brokerId: string): Promise<IntentStatus> {
  // Fetch the intent
  const [intent] = await db
    .select()
    .from(solanaPaymentIntents)
    .where(and(
      eq(solanaPaymentIntents.id, intentId),
      eq(solanaPaymentIntents.brokerId, brokerId)
    ));
  
  if (!intent) {
    throw new Error("Payment intent not found or unauthorized");
  }
  
  // Already confirmed or expired
  if (intent.status === "CONFIRMED") {
    return {
      id: intent.id,
      status: "CONFIRMED",
      planCode: intent.planCode,
      signature: intent.signature || undefined,
      confirmedAt: intent.confirmedAt || undefined,
      expiresAt: intent.expiresAt,
    };
  }
  
  const now = new Date();
  
  // Check expiration
  if (now > intent.expiresAt) {
    if (intent.status !== "EXPIRED") {
      await db
        .update(solanaPaymentIntents)
        .set({ status: "EXPIRED" })
        .where(eq(solanaPaymentIntents.id, intentId));
    }
    return {
      id: intent.id,
      status: "EXPIRED",
      planCode: intent.planCode,
      expiresAt: intent.expiresAt,
    };
  }
  
  // Try to find and validate payment on-chain
  try {
    const connection = getSolanaConnection();
    const reference = new PublicKey(intent.reference);
    const merchantWallet = getMerchantWallet();
    const usdcMint = getUsdcMint();
    
    // Find the transaction with this reference
    const signatureInfo = await findReference(connection, reference, { finality: "confirmed" });
    
    // Validate the transfer details
    await validateTransfer(connection, signatureInfo.signature, {
      recipient: merchantWallet,
      amount: new BigNumber(PRO_PLAN_PRICE_USDC),
      splToken: usdcMint,
      reference: reference,
    });
    
    // Payment validated! Update intent and activate PRO plan
    const confirmedAt = new Date();
    
    await db
      .update(solanaPaymentIntents)
      .set({
        status: "CONFIRMED",
        signature: signatureInfo.signature,
        confirmedAt,
      })
      .where(eq(solanaPaymentIntents.id, intentId));
    
    // Activate PRO plan for broker
    const planInfo = await activateProPlan(brokerId);
    
    console.log(`[Solana] Confirmed payment ${signatureInfo.signature} for broker ${brokerId}`);
    
    return {
      id: intent.id,
      status: "CONFIRMED",
      planCode: intent.planCode,
      signature: signatureInfo.signature,
      confirmedAt,
      expiresAt: intent.expiresAt,
      planInfo,
    };
  } catch (error: any) {
    // Payment not found yet or validation failed - this is normal for pending payments
    if (error.name === "FindReferenceError") {
      // Payment not yet made - return pending status
      return {
        id: intent.id,
        status: "PENDING",
        planCode: intent.planCode,
        expiresAt: intent.expiresAt,
      };
    }
    
    console.error(`[Solana] Error checking payment for intent ${intentId}:`, error.message);
    
    // Return pending for other transient errors
    return {
      id: intent.id,
      status: "PENDING",
      planCode: intent.planCode,
      expiresAt: intent.expiresAt,
    };
  }
}

async function activateProPlan(brokerId: string): Promise<{ planCode: string; includedLoads: number; cycleEndAt: Date }> {
  const now = new Date();
  const cycleEndAt = new Date(now.getTime() + PRO_CYCLE_DAYS * 24 * 60 * 60 * 1000);
  
  // Update or create broker entitlements with PRO plan
  const [existing] = await db
    .select()
    .from(brokerEntitlements)
    .where(eq(brokerEntitlements.brokerId, brokerId));
  
  if (existing) {
    await db
      .update(brokerEntitlements)
      .set({
        plan: "PRO",
        includedLoads: PRO_INCLUDED_LOADS,
        cycleStartAt: now,
        cycleEndAt,
        loadsUsed: 0, // Reset for new cycle
        status: "active",
        updatedAt: now,
      })
      .where(eq(brokerEntitlements.brokerId, brokerId));
  } else {
    await db
      .insert(brokerEntitlements)
      .values({
        brokerId,
        plan: "PRO",
        includedLoads: PRO_INCLUDED_LOADS,
        cycleStartAt: now,
        cycleEndAt,
        loadsUsed: 0,
        status: "active",
      });
  }
  
  console.log(`[Solana] Activated PRO plan for broker ${brokerId}, cycle ends ${cycleEndAt.toISOString()}`);
  
  return {
    planCode: "PRO",
    includedLoads: PRO_INCLUDED_LOADS,
    cycleEndAt,
  };
}

export function getMerchantInfo() {
  return {
    merchantWallet: SOLANA_MERCHANT_WALLET || null,
    usdcMint: SOLANA_USDC_MINT,
    label: SOLANA_PAY_LABEL,
    message: SOLANA_PAY_MESSAGE,
    proPlanPrice: PRO_PLAN_PRICE_USDC,
    proPlanLoads: PRO_INCLUDED_LOADS,
    configured: !!SOLANA_MERCHANT_WALLET,
  };
}
