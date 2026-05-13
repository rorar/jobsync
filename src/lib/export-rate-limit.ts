import "server-only";

/**
 * Export Rate Limiter — In-memory sliding window rate limiting for user data export.
 *
 * Limit: 1 export per hour per user.
 * Uses in-memory Map on globalThis (survives HMR).
 * Same single-process limitation as src/lib/api/rate-limit.ts (SEC-16).
 */

const EXPORT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const EXPORT_MAX_PER_WINDOW = 1;
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

interface RateLimitEntry {
  timestamps: number[];
}

export interface ExportRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Store — globalThis singleton (survives HMR)
// ---------------------------------------------------------------------------

const g = globalThis as unknown as {
  __exportRateLimitStore?: Map<string, RateLimitEntry>;
  __exportRateLimitCleanup?: ReturnType<typeof setInterval> | null;
};

if (!g.__exportRateLimitStore) {
  g.__exportRateLimitStore = new Map<string, RateLimitEntry>();
}

const store = g.__exportRateLimitStore;

// ---------------------------------------------------------------------------
// Periodic cleanup
// ---------------------------------------------------------------------------

function ensureCleanup(): void {
  if (g.__exportRateLimitCleanup) return;
  g.__exportRateLimitCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter(
        (ts) => now - ts < EXPORT_WINDOW_MS,
      );
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
    if (store.size === 0 && g.__exportRateLimitCleanup) {
      clearInterval(g.__exportRateLimitCleanup);
      g.__exportRateLimitCleanup = null;
    }
  }, CLEANUP_INTERVAL_MS);
  if (
    g.__exportRateLimitCleanup &&
    typeof g.__exportRateLimitCleanup === "object" &&
    "unref" in g.__exportRateLimitCleanup
  ) {
    g.__exportRateLimitCleanup.unref();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check export rate limit: 1 export per hour per user.
 */
export function checkExportRateLimit(userId: string): ExportRateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const windowStart = now - EXPORT_WINDOW_MS;

  let entry = store.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(userId, entry);
  }

  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= EXPORT_MAX_PER_WINDOW) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + EXPORT_WINDOW_MS - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Reset export rate limit state (for testing).
 */
export function resetExportRateLimitStore(): void {
  store.clear();
  if (g.__exportRateLimitCleanup) {
    clearInterval(g.__exportRateLimitCleanup);
    g.__exportRateLimitCleanup = null;
  }
}
