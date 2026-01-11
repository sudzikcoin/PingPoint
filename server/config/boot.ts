import { URL } from "url";
import { assertDatabaseSafety, type DatabaseInfo } from "../db/safety";

export interface BootConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  dbHost: string;
  dbName: string;
  dbUser: string;
  dbProvider: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  isDocker: boolean;
  disableAutoMigrations: boolean;
  disableDbSeed: boolean;
}

function getEffectivePort(): number {
  if (process.env.PORT) {
    return parseInt(process.env.PORT, 10);
  }
  if (process.env.NODE_ENV === "production") {
    return 8080;
  }
  return 5000;
}

export function getEffectiveDatabaseUrl(): string {
  const nodeEnv = process.env.NODE_ENV || "development";
  
  if (nodeEnv === "test") {
    if (process.env.DATABASE_URL_TEST) {
      return process.env.DATABASE_URL_TEST;
    }
    if (process.env.DATABASE_URL) {
      console.warn("[DB] WARNING: NODE_ENV=test but DATABASE_URL_TEST not set");
      console.warn("[DB] Using DATABASE_URL - tests may affect development data!");
      return process.env.DATABASE_URL;
    }
    throw new Error("DATABASE_URL_TEST or DATABASE_URL must be set for tests");
  }
  
  if (nodeEnv === "development") {
    if (process.env.DATABASE_URL_DEV) {
      return process.env.DATABASE_URL_DEV;
    }
    if (process.env.DATABASE_URL) {
      return process.env.DATABASE_URL;
    }
    throw new Error("DATABASE_URL_DEV or DATABASE_URL must be set for development");
  }
  
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

function detectDocker(dbUrl: string): boolean {
  return dbUrl.includes("@db:") || dbUrl.includes("pingpoint-db");
}

function getDisableAutoMigrations(): boolean {
  if (process.env.DISABLE_AUTO_MIGRATIONS !== undefined) {
    return process.env.DISABLE_AUTO_MIGRATIONS === "true";
  }
  return process.env.NODE_ENV === "production";
}

function getDisableDbSeed(): boolean {
  if (process.env.DISABLE_DB_SEED !== undefined) {
    return process.env.DISABLE_DB_SEED === "true";
  }
  return process.env.NODE_ENV === "production";
}

export function getBootConfig(): BootConfig {
  const nodeEnv = process.env.NODE_ENV || "";
  const databaseUrl = getEffectiveDatabaseUrl();
  
  const dbInfo = assertDatabaseSafety({
    nodeEnv,
    databaseUrl,
  });
  
  return {
    nodeEnv,
    port: getEffectivePort(),
    databaseUrl,
    dbHost: dbInfo.host,
    dbName: dbInfo.database,
    dbUser: dbInfo.user,
    dbProvider: dbInfo.provider,
    isProduction: nodeEnv === "production",
    isDevelopment: nodeEnv === "development",
    isTest: nodeEnv === "test",
    isDocker: detectDocker(databaseUrl),
    disableAutoMigrations: getDisableAutoMigrations(),
    disableDbSeed: getDisableDbSeed(),
  };
}

export function validateBootConfig(config: BootConfig): void {
  if (!config.nodeEnv) {
    console.error("[BOOT] FATAL: NODE_ENV is not set");
    console.error("[BOOT] Set NODE_ENV to: development, test, or production");
    process.exit(1);
  }
  
  if (!["development", "test", "production"].includes(config.nodeEnv)) {
    console.warn(`[BOOT] WARNING: Unrecognized NODE_ENV="${config.nodeEnv}"`);
  }
  
  if (config.isProduction) {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      console.error("[BOOT] FATAL: Production requires JWT_SECRET (min 32 chars)");
      process.exit(1);
    }
    
    if (!process.env.POSTGRES_PASSWORD && config.isDocker) {
      console.error("[BOOT] FATAL: Production Docker requires POSTGRES_PASSWORD");
      process.exit(1);
    }
  }
  
  if (config.isDevelopment && config.isDocker) {
    console.warn("[BOOT] WARNING: Development env using Docker database");
    console.warn("[BOOT] Consider using DATABASE_URL_DEV for local dev");
  }
}

export function logBootConfig(config: BootConfig): void {
  console.log("=".repeat(60));
  console.log("[BOOT] ENV=" + config.nodeEnv);
  console.log("[BOOT] DB=" + config.dbHost + " / " + config.dbName + " (provider: " + config.dbProvider + ")");
  console.log("[BOOT] PORT=" + config.port);
  if (config.isProduction) {
    console.log("[BOOT] AUTO_MIGRATIONS=" + (!config.disableAutoMigrations));
    console.log("[BOOT] DB_SEED=" + (!config.disableDbSeed));
  }
  console.log("=".repeat(60));
}

export function handlePortError(err: NodeJS.ErrnoException, port: number): void {
  if (err.code === "EADDRINUSE") {
    console.error("=".repeat(60));
    console.error("[BOOT] FATAL: Port %d is already in use", port);
    console.error("[BOOT] Another process is using this port.");
    console.error("[BOOT] Options:");
    console.error("  1. Stop the other process using port %d", port);
    console.error("  2. Set a different PORT environment variable");
    if (port === 5000) {
      console.error("  3. If Docker is running, stop it: docker-compose down");
    }
    console.error("=".repeat(60));
    process.exit(1);
  }
  throw err;
}
