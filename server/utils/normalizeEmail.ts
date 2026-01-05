/**
 * Normalize email address: trim whitespace and convert to lowercase
 * Use this consistently across all auth operations to prevent duplicate accounts
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
