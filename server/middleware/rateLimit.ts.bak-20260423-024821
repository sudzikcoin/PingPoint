import { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";
import { RateLimitError } from "./errorHandler";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

function isRateLimitingEnabled(): boolean {
  return process.env.ENABLE_RATE_LIMITING !== "false";
}

export interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
  keyPrefix?: string;
  message?: string;
  useUserId?: boolean;
}

function extractUserIdentifier(req: Request, useUserId: boolean): string {
  if (useUserId) {
    if ((req as any).brokerId) {
      return `broker:${(req as any).brokerId}`;
    }
    const email = req.body?.email || req.body?.brokerEmail;
    if (email && typeof email === "string" && email.includes("@")) {
      return `email:${email.trim().toLowerCase()}`;
    }
  }
  return `ip:${req.ip || "unknown"}`;
}

export function rateLimit(options?: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isRateLimitingEnabled()) {
      return next();
    }

    const config = getConfig();
    const maxRequests = options?.maxRequests ?? config.RATE_LIMIT_MAX_REQUESTS;
    const windowMs = options?.windowMs ?? config.RATE_LIMIT_WINDOW_MS;
    const keyPrefix = options?.keyPrefix ?? "general";
    const message = options?.message ?? "Too many requests. Please try again later.";
    
    const keyIdentifier = extractUserIdentifier(req, options?.useUserId ?? false);
    
    const key = `${keyPrefix}:${keyIdentifier}`;
    const now = Date.now();
    
    let entry = rateLimitStore.get(key);
    
    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    } else {
      entry.count++;
    }
    
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);
    
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
    
    if (entry.count > maxRequests) {
      res.setHeader("Retry-After", resetSeconds);
      return res.status(429).json({
        error: "Rate limit exceeded",
        message,
        retryAfter: resetSeconds,
        limit: maxRequests,
        remaining: 0,
      });
    }
    
    next();
  };
}

export function strictRateLimit(maxRequests = 10, windowMs = 60000) {
  return rateLimit({ maxRequests, windowMs });
}

export const generalLimiter = rateLimit({
  maxRequests: 200,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "general",
  message: "Too many requests. Please try again in 15 minutes.",
});

export const pdfParsingLimiter = rateLimit({
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
  keyPrefix: "pdf",
  message: "PDF parsing limit reached. Maximum 20 per hour.",
  useUserId: true,
});

export const loadCreationLimiter = rateLimit({
  maxRequests: 100,
  windowMs: 60 * 60 * 1000,
  keyPrefix: "load-create",
  message: "Load creation limit reached. Maximum 100 per hour.",
  useUserId: true,
});

export const authLimiter = rateLimit({
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "auth",
  message: "Too many login attempts. Try again in 15 minutes.",
});

export const signupLimiter = rateLimit({
  maxRequests: 5,
  windowMs: 60 * 1000,
  keyPrefix: "signup",
  message: "Too many signup attempts. Try again in a minute.",
});

export function logRateLimitStatus(): void {
  if (isRateLimitingEnabled()) {
    console.log("[RateLimit] Rate limiting: ENABLED");
  } else {
    console.log("[RateLimit] Rate limiting: DISABLED (ENABLE_RATE_LIMITING=false)");
  }
}
