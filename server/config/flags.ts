export const DEMO_MODE = process.env.DEMO_MODE === "true";
export const BILLING_ENABLED = process.env.BILLING_ENABLED === "true";
export const ENFORCE_LIMITS = process.env.ENFORCE_LIMITS === "true";

export function getFlags() {
  return {
    DEMO_MODE,
    BILLING_ENABLED,
    ENFORCE_LIMITS,
  };
}
