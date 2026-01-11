const PLACEHOLDER_PATTERNS = [
  /^(your|change|placeholder|example|test|default|todo)/i,
  /yourdomain\.com/i,
  /^re_your_/i,
  /^sk_test_/i,
  /^change_this/i,
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(value));
}

export interface EnvValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  emailConfigured: boolean;
}

export interface ValidatedEnv {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  ANTHROPIC_API_KEY?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  PINGPOINT_PUBLIC_URL?: string;
  ENABLE_CRON_JOBS: boolean;
  ENABLE_FILE_LOGGING: boolean;
  LOG_LEVEL: string;
}

export function getValidatedEnv(): ValidatedEnv {
  return {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: parseInt(process.env.PORT || "5000", 10),
    DATABASE_URL: process.env.DATABASE_URL || "",
    JWT_SECRET: process.env.JWT_SECRET || "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    MAIL_FROM: process.env.MAIL_FROM,
    PINGPOINT_PUBLIC_URL: process.env.PINGPOINT_PUBLIC_URL || process.env.APP_URL,
    ENABLE_CRON_JOBS: process.env.ENABLE_CRON_JOBS !== "false",
    ENABLE_FILE_LOGGING: process.env.ENABLE_FILE_LOGGING !== "false",
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
  };
}

export function validateEnv(): EnvValidation {
  if (process.env.SKIP_ENV_VALIDATION === "true") {
    console.log("[ENV] Environment validation skipped via SKIP_ENV_VALIDATION");
    return { valid: true, errors: [], warnings: [], emailConfigured: false };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    errors.push("DATABASE_URL is required but not set");
  } else if (isPlaceholder(databaseUrl)) {
    errors.push("DATABASE_URL appears to be a placeholder value");
  } else if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    errors.push("DATABASE_URL must start with postgresql:// or postgres://");
  }
  
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) {
      errors.push("JWT_SECRET is required in production");
    } else {
      warnings.push("JWT_SECRET not set (required for production)");
    }
  } else if (isPlaceholder(jwtSecret)) {
    errors.push("JWT_SECRET appears to be a placeholder value");
  } else if (jwtSecret.length < 32) {
    if (isProduction) {
      errors.push("JWT_SECRET must be at least 32 characters in production");
    } else {
      warnings.push("JWT_SECRET should be at least 32 characters");
    }
  }
  
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!anthropicKey) {
    warnings.push("ANTHROPIC_API_KEY not set - PDF parsing will be disabled");
  }
  
  const resendApiKey = process.env.RESEND_API_KEY;
  const mailFrom = process.env.MAIL_FROM;
  let emailConfigured = false;
  
  if (!resendApiKey) {
    warnings.push("RESEND_API_KEY not set - email sending disabled");
  } else if (isPlaceholder(resendApiKey)) {
    warnings.push("RESEND_API_KEY appears to be a placeholder - email sending disabled");
  } else {
    if (!mailFrom) {
      warnings.push("MAIL_FROM not set - email may fail");
    } else if (isPlaceholder(mailFrom)) {
      warnings.push("MAIL_FROM appears to be a placeholder (e.g. no-reply@yourdomain.com)");
    } else {
      emailConfigured = true;
    }
  }
  
  const publicUrl = process.env.PINGPOINT_PUBLIC_URL || process.env.APP_URL || process.env.BASE_URL;
  if (!publicUrl) {
    warnings.push("No PINGPOINT_PUBLIC_URL set - email links may not work correctly");
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    warnings.push("STRIPE_SECRET_KEY not set - billing features disabled");
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    emailConfigured
  };
}

export function logEnvStatus(): void {
  const validation = validateEnv();
  
  if (validation.errors.length > 0) {
    console.error("[ENV] Critical configuration errors:");
    validation.errors.forEach(err => console.error(`  ✗ ${err}`));
  }
  
  if (validation.warnings.length > 0) {
    console.warn("[ENV] Configuration warnings:");
    validation.warnings.forEach(warn => console.warn(`  ⚠ ${warn}`));
  }
  
  if (validation.valid && validation.warnings.length === 0) {
    console.log("[ENV] All configuration validated successfully");
  }
  
  console.log(`[ENV] Email sending: ${validation.emailConfigured ? "ENABLED" : "DISABLED"}`);
}

export function isEmailConfigured(): boolean {
  return validateEnv().emailConfigured;
}

// Admin configuration
export const adminConfig = {
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
};

export function isAdminConfigured(): boolean {
  return !!(adminConfig.ADMIN_EMAIL && adminConfig.ADMIN_PASSWORD);
}

export function logAdminStatus(): void {
  const jwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  
  if (!isAdminConfigured()) {
    console.warn("[ADMIN] ADMIN_EMAIL or ADMIN_PASSWORD is not set – admin login will be disabled");
  } else if (!jwtSecret) {
    console.warn("[ADMIN] ADMIN_EMAIL/PASSWORD set but JWT_SECRET is missing – admin login will be disabled");
  } else {
    console.log("[ADMIN] Admin login: ENABLED");
  }
}
