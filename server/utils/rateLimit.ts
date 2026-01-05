const pingBuckets = new Map<string, number>();

export const MIN_PING_INTERVAL_MS = 30000;

export function shouldAcceptPing(key: string, nowMs = Date.now()): boolean {
  const last = pingBuckets.get(key) ?? 0;
  if (nowMs - last < MIN_PING_INTERVAL_MS) {
    return false;
  }
  pingBuckets.set(key, nowMs);
  return true;
}

setInterval(() => {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000;
  Array.from(pingBuckets.entries()).forEach(([key, timestamp]) => {
    if (now - timestamp > maxAge) {
      pingBuckets.delete(key);
    }
  });
}, 60000);
