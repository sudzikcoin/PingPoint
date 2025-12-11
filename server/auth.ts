import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import type { Broker, BrokerDevice } from "@shared/schema";

const COOKIE_NAME = "pingpoint_broker_session";
const DEVICE_COOKIE_NAME = "pp_device";

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

// Trusted Device Cookie Functions

export function getDeviceIdFromRequest(req: Request): string | null {
  return req.cookies[DEVICE_COOKIE_NAME] || null;
}

export async function getTrustedDevice(
  req: Request,
  brokerId: string
): Promise<BrokerDevice | null> {
  const deviceId = getDeviceIdFromRequest(req);
  if (!deviceId) return null;

  const device = await storage.getBrokerDevice(brokerId, deviceId);
  return device || null;
}

export async function createTrustedDevice(
  req: Request,
  res: Response,
  brokerId: string
): Promise<BrokerDevice> {
  // Generate a new device ID
  const deviceId = randomBytes(32).toString('hex');
  const userAgent = req.headers['user-agent'] || undefined;

  // Create device record in database
  const device = await storage.createBrokerDevice(brokerId, deviceId, userAgent);

  // Set the device cookie
  res.cookie(DEVICE_COOKIE_NAME, deviceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180 * 1000, // 180 days in milliseconds
  });

  return device;
}

export async function getOrCreateTrustedDevice(
  req: Request,
  res: Response,
  brokerId: string
): Promise<BrokerDevice> {
  const existingDevice = await getTrustedDevice(req, brokerId);
  
  if (existingDevice) {
    // Update last used timestamp
    await storage.updateBrokerDeviceLastUsed(existingDevice.id);
    return existingDevice;
  }

  // Create new trusted device
  return createTrustedDevice(req, res, brokerId);
}
