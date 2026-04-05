import "server-only";

/**
 * Push Notification Rate Limiter — In-memory sliding window.
 *
 * - Test push: 1 per 60 seconds per user
 * - Push dispatch: 20 per minute per user (channel-level)
 *
 * Uses globalThis singleton (survives HMR).
 * Same single-process limitation as email rate limiter (SEC-16).
 */

const TEST_PUSH_WINDOW_MS = 60_000; // 60 seconds
const TEST_PUSH_MAX_PER_WINDOW = 1;
const PUSH_DISPATCH_WINDOW_MS = 60_000; // 1 minute
const PUSH_DISPATCH_MAX_PER_WINDOW = 20;
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

interface RateLimitEntry {
  timestamps: number[];
}

export interface PushRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Stores — globalThis singletons (survive HMR)
// ---------------------------------------------------------------------------

const g = globalThis as unknown as {
  __pushTestRateLimitStore?: Map<string, RateLimitEntry>;
  __pushDispatchRateLimitStore?: Map<string, RateLimitEntry>;
  __pushRateLimitCleanup?: ReturnType<typeof setInterval> | null;
};

if (!g.__pushTestRateLimitStore) {
  g.__pushTestRateLimitStore = new Map<string, RateLimitEntry>();
}
if (!g.__pushDispatchRateLimitStore) {
  g.__pushDispatchRateLimitStore = new Map<string, RateLimitEntry>();
}

const testStore = g.__pushTestRateLimitStore;
const dispatchStore = g.__pushDispatchRateLimitStore;

// ---------------------------------------------------------------------------
// Periodic cleanup
// ---------------------------------------------------------------------------

function ensureCleanup(): void {
  if (g.__pushRateLimitCleanup) return;
  g.__pushRateLimitCleanup = setInterval(() => {
    const now = Date.now();
    for (const store of [testStore, dispatchStore]) {
      for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter(
          (ts) => now - ts < PUSH_DISPATCH_WINDOW_MS,
        );
        if (entry.timestamps.length === 0) {
          store.delete(key);
        }
      }
    }
    if (
      testStore.size === 0 &&
      dispatchStore.size === 0 &&
      g.__pushRateLimitCleanup
    ) {
      clearInterval(g.__pushRateLimitCleanup);
      g.__pushRateLimitCleanup = null;
    }
  }, CLEANUP_INTERVAL_MS);
  if (
    g.__pushRateLimitCleanup &&
    typeof g.__pushRateLimitCleanup === "object" &&
    "unref" in g.__pushRateLimitCleanup
  ) {
    g.__pushRateLimitCleanup.unref();
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
): PushRateLimitResult {
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
 * Check test push rate limit: 1 test push per 60 seconds per user.
 */
export function checkTestPushRateLimit(userId: string): PushRateLimitResult {
  return slidingWindowCheck(
    testStore,
    `test:${userId}`,
    TEST_PUSH_MAX_PER_WINDOW,
    TEST_PUSH_WINDOW_MS,
  );
}

/**
 * Check push dispatch rate limit: 20 pushes per minute per user.
 */
export function checkPushDispatchRateLimit(
  userId: string,
): PushRateLimitResult {
  return slidingWindowCheck(
    dispatchStore,
    userId,
    PUSH_DISPATCH_MAX_PER_WINDOW,
    PUSH_DISPATCH_WINDOW_MS,
  );
}

/**
 * Reset all push rate limit state (for testing).
 */
export function resetPushRateLimitStores(): void {
  testStore.clear();
  dispatchStore.clear();
  if (g.__pushRateLimitCleanup) {
    clearInterval(g.__pushRateLimitCleanup);
    g.__pushRateLimitCleanup = null;
  }
}
