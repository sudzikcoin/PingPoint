import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import type { Broker } from "@shared/schema";

const COOKIE_NAME = "pingpoint_broker_session";

function getSecret(): string {
  const secret = process.env.PINGPOINT_BROKER_JWT_SECRET || "dev_secret_change_me_in_production";
  return secret;
}

export function createBrokerSession(brokerId: string, res: Response): void {
  const token = jwt.sign({ brokerId }, getSecret(), {
    expiresIn: "30d",
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days in milliseconds
  });
}

export async function getBrokerFromRequest(req: Request): Promise<Broker | null> {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, getSecret()) as { brokerId: string };
    const broker = await storage.getBroker(payload.brokerId);
    return broker || null;
  } catch (err) {
    return null;
  }
}

export function clearBrokerSession(res: Response): void {
  res.clearCookie(COOKIE_NAME);
}
