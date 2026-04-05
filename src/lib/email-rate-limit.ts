import "server-only";

/**
 * Email Rate Limiter — In-memory sliding window rate limiting for email dispatch.
 *
 * Two limits:
 * - Email dispatch: 10 emails per minute per user
 * - Test email: 1 test email per 60 seconds per user
 *
 * Uses in-memory Map on globalThis (survives HMR).
 * Same single-process limitation as src/lib/api/rate-limit.ts (SEC-16).
 */

const EMAIL_WINDOW_MS = 60_000; // 1 minute
const EMAIL_MAX_PER_WINDOW = 10;
const TEST_EMAIL_WINDOW_MS = 60_000; // 60 seconds
const TEST_EMAIL_MAX_PER_WINDOW = 1;
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

interface RateLimitEntry {
  timestamps: number[];
}

export interface EmailRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Stores — globalThis singletons (survive HMR)
// ---------------------------------------------------------------------------

const g = globalThis as unknown as {
  __emailRateLimitStore?: Map<string, RateLimitEntry>;
  __testEmailRateLimitStore?: Map<string, RateLimitEntry>;
  __emailRateLimitCleanup?: ReturnType<typeof setInterval> | null;
};

if (!g.__emailRateLimitStore) {
  g.__emailRateLimitStore = new Map<string, RateLimitEntry>();
}
if (!g.__testEmailRateLimitStore) {
  g.__testEmailRateLimitStore = new Map<string, RateLimitEntry>();
}

const emailStore = g.__emailRateLimitStore;
const testEmailStore = g.__testEmailRateLimitStore;

// ---------------------------------------------------------------------------
// Periodic cleanup
// ---------------------------------------------------------------------------

function ensureCleanup(): void {
  if (g.__emailRateLimitCleanup) return;
  g.__emailRateLimitCleanup = setInterval(() => {
    const now = Date.now();
    for (const store of [emailStore, testEmailStore]) {
      for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter(
          (ts) => now - ts < EMAIL_WINDOW_MS,
        );
        if (entry.timestamps.length === 0) {
          store.delete(key);
        }
      }
    }
    if (emailStore.size === 0 && testEmailStore.size === 0 && g.__emailRateLimitCleanup) {
      clearInterval(g.__emailRateLimitCleanup);
      g.__emailRateLimitCleanup = null;
    }
  }, CLEANUP_INTERVAL_MS);
  if (
    g.__emailRateLimitCleanup &&
    typeof g.__emailRateLimitCleanup === "object" &&
    "unref" in g.__emailRateLimitCleanup
  ) {
    g.__emailRateLimitCleanup.unref();
  }
}

// ---------------------------------------------------------------------------
// Core sliding window check
// ---------------------------------------------------------------------------

function slidingWindowCheck(
  store: Map<string, RateLimitEntry>,
  key: string,
  maxPerWindow: number,
  windowMs: number,
): EmailRateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= maxPerWindow) {
    // Earliest timestamp in window + windowMs = when the window slides enough
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  // Record this request
  entry.timestamps.push(now);
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check email dispatch rate limit: 10 emails per minute per user.
 */
export function checkEmailRateLimit(userId: string): EmailRateLimitResult {
  return slidingWindowCheck(emailStore, userId, EMAIL_MAX_PER_WINDOW, EMAIL_WINDOW_MS);
}

/**
 * Check test email rate limit: 1 test email per 60 seconds per user.
 */
export function checkTestEmailRateLimit(userId: string): EmailRateLimitResult {
  return slidingWindowCheck(testEmailStore, `test:${userId}`, TEST_EMAIL_MAX_PER_WINDOW, TEST_EMAIL_WINDOW_MS);
}

/**
 * Reset all email rate limit state (for testing).
 */
export function resetEmailRateLimitStores(): void {
  emailStore.clear();
  testEmailStore.clear();
  if (g.__emailRateLimitCleanup) {
    clearInterval(g.__emailRateLimitCleanup);
    g.__emailRateLimitCleanup = null;
  }
}
