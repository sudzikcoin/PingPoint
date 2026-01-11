import { Request, Response, NextFunction } from "express";
import { isProduction, isDevelopment } from "../config";

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  if (isProduction()) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  
  res.removeHeader("X-Powered-By");
  
  next();
}

function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  
  if (process.env.PINGPOINT_PUBLIC_URL) {
    origins.push(process.env.PINGPOINT_PUBLIC_URL);
  }
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }
  
  origins.push(
    "http://localhost:5000",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173"
  );
  
  return origins.filter(Boolean);
}

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  
  if (isDevelopment() || process.env.CORS_STRICT === "false") {
    return true;
  }
  
  return getAllowedOrigins().includes(origin);
}

export function corsHandler(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin");
  
  if (isOriginAllowed(origin)) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
  } else {
    console.warn(`[CORS] Blocked request from origin: ${origin}`);
  }
  
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset");
  res.setHeader("Access-Control-Max-Age", "86400");
  
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  
  next();
}

export function logCorsStatus(): void {
  const isStrict = process.env.CORS_STRICT !== "false" && isProduction();
  if (isStrict) {
    console.log("[CORS] Strict mode: ENABLED (production)");
    console.log(`[CORS] Allowed origins: ${getAllowedOrigins().join(", ")}`);
  } else {
    console.log("[CORS] Strict mode: DISABLED (development/CORS_STRICT=false)");
  }
}
