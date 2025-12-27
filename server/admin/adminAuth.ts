import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { adminConfig, isAdminConfigured } from "../config/env";

const ADMIN_COOKIE_NAME = "pingpoint_admin_session";

function getAdminSecret(): string {
  return process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || "admin_dev_secret_change_me";
}

export interface AdminSession {
  isAdmin: boolean;
  email: string;
}

export function createAdminSession(email: string, res: Response): void {
  const token = jwt.sign({ isAdmin: true, email }, getAdminSecret(), {
    expiresIn: "24h",
  });

  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 1000, // 24 hours
  });
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
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getAdminSecret()) as AdminSession;
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

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminConfigured()) {
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
