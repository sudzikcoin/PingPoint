import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  RESEND_API_KEY: z.string().optional(),
  PINGPOINT_PUBLIC_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32).default("pingpoint-dev-secret-change-in-production-32chars"),
  PORT: z.coerce.number().default(5000),
  SESSION_COOKIE_NAME: z.string().default("pingpoint_broker_session"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  VERIFICATION_TOKEN_EXPIRY_DAYS: z.coerce.number().default(2),
  JWT_EXPIRY_DAYS: z.coerce.number().default(30),
});

export type Config = z.infer<typeof envSchema>;

let configCache: Config | null = null;

export function getConfig(): Config {
  if (configCache) return configCache;
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error("Configuration validation failed:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Invalid environment configuration. See errors above.");
  }
  
  configCache = result.data;
  return configCache;
}

export function resetConfig(): void {
  configCache = null;
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === "development";
}

export function isTest(): boolean {
  return getConfig().NODE_ENV === "test";
}

export function getBaseUrl(req?: { protocol: string; get: (header: string) => string | undefined }): string {
  const config = getConfig();
  
  if (config.PINGPOINT_PUBLIC_URL) {
    return config.PINGPOINT_PUBLIC_URL.replace(/\/$/, "");
  }
  
  if (req) {
    const protocol = req.protocol || "https";
    const host = req.get("host") || "localhost:5000";
    return `${protocol}://${host}`;
  }
  
  return isDevelopment() ? "http://localhost:5000" : "https://pingpoint.replit.app";
}
