import { Request, Response, NextFunction } from "express";
import { isProduction, isTest } from "../config";
import { logger } from "../utils/logger";

interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  statusCode?: number;
  duration?: number;
  ip?: string;
  userAgent?: string;
  error?: string;
  [key: string]: unknown;
}

function formatLog(entry: LogEntry): string {
  const parts = [
    entry.timestamp,
    `[${entry.method}]`,
    entry.path,
    entry.statusCode ? `${entry.statusCode}` : "",
    entry.duration !== undefined ? `${entry.duration}ms` : "",
  ].filter(Boolean);
  
  return parts.join(" ");
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (isTest()) {
    next();
    return;
  }
  
  const start = Date.now();
  const timestamp = new Date().toISOString();
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    const entry: LogEntry = {
      timestamp,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
    };
    
    if (isProduction()) {
      entry.ip = req.ip || req.socket.remoteAddress;
      entry.userAgent = req.get("user-agent");
    }
    
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    const message = formatLog(entry);
    
    if (level === "error") {
      logger.error(message, entry);
    } else if (level === "warn") {
      logger.warn(message, entry);
    } else {
      logger.info(message, entry);
    }
  });
  
  next();
}
