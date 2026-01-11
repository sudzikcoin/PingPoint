import { URL } from "url";

export interface BootConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  dbHost: string;
  dbName: string;
  dbUser: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  isDocker: boolean;
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

function parseDatabaseUrl(dbUrl: string): { host: string; name: string; user: string } {
  try {
    const url = new URL(dbUrl);
    return {
      host: url.hostname,
      name: url.pathname.slice(1),
      user: url.username,
    };
  } catch {
    return { host: "unknown", name: "unknown", user: "unknown" };
  }
}

function detectDocker(dbUrl: string): boolean {
  return dbUrl.includes("@db:") || dbUrl.includes("pingpoint-db");
}

export function getBootConfig(): BootConfig {
  const nodeEnv = process.env.NODE_ENV || "";
  const databaseUrl = getEffectiveDatabaseUrl();
  const { host, name, user } = parseDatabaseUrl(databaseUrl);
  
  return {
    nodeEnv,
    port: getEffectivePort(),
    databaseUrl,
    dbHost: host,
    dbName: name,
    dbUser: user,
    isProduction: nodeEnv === "production",
    isDevelopment: nodeEnv === "development",
    isTest: nodeEnv === "test",
    isDocker: detectDocker(databaseUrl),
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
    if (config.dbHost === "localhost" || config.dbHost === "127.0.0.1") {
      console.error("[BOOT] FATAL: Production cannot use localhost database");
      console.error("[BOOT] DATABASE_URL points to:", config.dbHost);
      process.exit(1);
    }
    
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      console.error("[BOOT] FATAL: Production requires JWT_SECRET (min 32 chars)");
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
  console.log("[BOOT] DB=" + config.dbHost + " / " + config.dbName);
  console.log("[BOOT] PORT=" + config.port);
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
