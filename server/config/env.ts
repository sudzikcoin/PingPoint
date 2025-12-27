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

export function validateEnv(): EnvValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    errors.push("DATABASE_URL is required but not set");
  } else if (isPlaceholder(databaseUrl)) {
    errors.push("DATABASE_URL appears to be a placeholder value");
  }
  
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    warnings.push("JWT_SECRET not set, using default (insecure for production)");
  } else if (isPlaceholder(jwtSecret) || jwtSecret.length < 32) {
    warnings.push("JWT_SECRET appears weak or is a placeholder (should be 32+ chars)");
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
    warnings.push("No PUBLIC_URL/APP_URL set - email links may not work correctly");
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
  if (!isAdminConfigured()) {
    console.warn("[ADMIN] ADMIN_EMAIL or ADMIN_PASSWORD is not set – admin login will be disabled");
  } else {
    console.log("[ADMIN] Admin login: ENABLED");
  }
}
