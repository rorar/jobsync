import "server-only";

/**
 * Health Check Rate Limiter — In-memory sliding window rate limiting.
 *
 * Limits: 10 health checks per minute per user.
 * Protects external EU APIs from excessive probing via the Check All button.
 *
 * Uses in-memory Map on globalThis (survives HMR).
 * Same pattern as src/lib/email-rate-limit.ts.
 */

const HEALTH_CHECK_WINDOW_MS = 60_000; // 1 minute
const HEALTH_CHECK_MAX_PER_WINDOW = 10;

interface RateLimitEntry {
  timestamps: number[];
}

export interface HealthRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

const g = globalThis as unknown as {
  __healthCheckRateLimitStore?: Map<string, RateLimitEntry>;
};

if (!g.__healthCheckRateLimitStore) {
  g.__healthCheckRateLimitStore = new Map<string, RateLimitEntry>();
}

const store = g.__healthCheckRateLimitStore;

/**
 * Check health check rate limit: 10 checks per minute per user.
 */
export function checkHealthCheckRateLimit(userId: string): HealthRateLimitResult {
  const now = Date.now();
  const windowStart = now - HEALTH_CHECK_WINDOW_MS;

  let entry = store.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(userId, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= HEALTH_CHECK_MAX_PER_WINDOW) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + HEALTH_CHECK_WINDOW_MS - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Reset health check rate limit state (for testing).
 */
export function resetHealthCheckRateLimitStore(): void {
  store.clear();
}
