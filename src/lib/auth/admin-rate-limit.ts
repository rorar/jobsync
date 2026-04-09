import "server-only";

/**
 * Admin Action Rate Limiter — Sprint 1.5 CRIT-S-04 remediation.
 *
 * Protects the admin surface (module activation/deactivation and other
 * shared-singleton toggles) against automation-flapping attacks: even a
 * legitimate admin should not be able to toggle a module 100 times per
 * minute, which would spam notifications and churn the domain-event bus.
 *
 * Limits: 10 admin actions per minute per user. Mirrors the sliding-window
 * pattern used by `src/lib/health-rate-limit.ts` and
 * `src/lib/email-rate-limit.ts` — in-memory Map on `globalThis` (HMR-safe).
 *
 * Scope note: the limiter is per-actor, not per-target. A burst of toggles
 * against a single module ties up the limiter just as much as a burst spread
 * across N modules, because the attack surface we care about is the
 * cross-tenant blast radius, not the target module.
 */

const ADMIN_ACTION_WINDOW_MS = 60_000; // 1 minute
const ADMIN_ACTION_MAX_PER_WINDOW = 10;

interface RateLimitEntry {
  timestamps: number[];
}

export interface AdminRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

const g = globalThis as unknown as {
  __adminActionRateLimitStore?: Map<string, RateLimitEntry>;
};

if (!g.__adminActionRateLimitStore) {
  g.__adminActionRateLimitStore = new Map<string, RateLimitEntry>();
}

const store = g.__adminActionRateLimitStore;

/**
 * Check admin-action rate limit: 10 actions per minute per user.
 */
export function checkAdminActionRateLimit(userId: string): AdminRateLimitResult {
  const now = Date.now();
  const windowStart = now - ADMIN_ACTION_WINDOW_MS;

  let entry = store.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(userId, entry);
  }

  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= ADMIN_ACTION_MAX_PER_WINDOW) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + ADMIN_ACTION_WINDOW_MS - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Reset admin-action rate limit store (for testing).
 */
export function resetAdminActionRateLimitStore(): void {
  store.clear();
}
