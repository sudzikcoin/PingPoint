import { Request, Response, NextFunction } from "express";
import { isProduction } from "../config";

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

export function corsHandler(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get("origin");
  
  const allowedOrigins = isProduction()
    ? [process.env.PINGPOINT_PUBLIC_URL || ""]
    : ["http://localhost:5000", "http://localhost:3000"];
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
  
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  
  next();
}
