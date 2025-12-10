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
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export function rateLimit(options?: { maxRequests?: number; windowMs?: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = getConfig();
    const maxRequests = options?.maxRequests ?? config.RATE_LIMIT_MAX_REQUESTS;
    const windowMs = options?.windowMs ?? config.RATE_LIMIT_WINDOW_MS;
    
    const key = `${req.ip || "unknown"}:${req.path}`;
    const now = Date.now();
    
    let entry = rateLimitStore.get(key);
    
    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    } else {
      entry.count++;
    }
    
    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
    
    if (entry.count > maxRequests) {
      return next(new RateLimitError());
    }
    
    next();
  };
}

export function strictRateLimit(maxRequests = 10, windowMs = 60000) {
  return rateLimit({ maxRequests, windowMs });
}
