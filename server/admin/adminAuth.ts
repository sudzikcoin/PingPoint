import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { adminConfig, isAdminConfigured } from "../config/env";

const ADMIN_COOKIE_NAME = "pingpoint_admin_session";

function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) return null;
  return secret;
}

export function isAdminSecretConfigured(): boolean {
  return getAdminSecret() !== null;
}

export interface AdminSession {
  isAdmin: boolean;
  email: string;
}

export function createAdminSession(email: string, res: Response): boolean {
  const secret = getAdminSecret();
  if (!secret) return false;

  const token = jwt.sign({ isAdmin: true, email }, secret, {
    expiresIn: "24h",
  });

  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 1000, // 24 hours
  });
  return true;
}

export function clearAdminSession(res: Response): void {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function getAdminFromRequest(req: Request): AdminSession | null {
  const secret = getAdminSecret();
  if (!secret) return null;

  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, secret) as AdminSession;
    if (decoded.isAdmin && decoded.email) {
      return decoded;
    }
    return null;
  } catch (err) {
    return null;
  }
}

export function isAdminSession(req: Request): boolean {
  return getAdminFromRequest(req) !== null;
}

export function isAdminFullyConfigured(): boolean {
  return isAdminConfigured() && isAdminSecretConfigured();
}

export function requireAdminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminFullyConfigured()) {
    res.status(503).json({ error: "Admin login not configured" });
    return;
  }
  
  if (isAdminSession(req)) {
    next();
    return;
  }
  
  res.status(401).json({ error: "Admin auth required" });
}

export function validateAdminCredentials(email: string, password: string): boolean {
  if (!isAdminConfigured()) return false;
  
  return (
    email.toLowerCase() === adminConfig.ADMIN_EMAIL.toLowerCase() &&
    password === adminConfig.ADMIN_PASSWORD
  );
}

export interface AdminInfo {
  id: string;
  email: string;
  isAdmin: boolean;
}

export async function requireAdminAuth(req: Request): Promise<AdminInfo | null> {
  if (!isAdminFullyConfigured()) return null;
  
  const session = getAdminFromRequest(req);
  if (!session) return null;
  
  return {
    id: "admin",
    email: session.email,
    isAdmin: true,
  };
}
