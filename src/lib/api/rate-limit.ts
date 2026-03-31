/**
 * In-memory sliding window rate limiter for Public API keys.
 * 60 requests per minute per API key (configurable).
 *
 * Uses a Map of timestamp arrays per key hash.
 * Cleanup runs periodically to prevent memory leaks.
 *
 * NOTE: Single-process only. Will NOT work correctly in serverless
 * or multi-instance deployments. For distributed deployments,
 * replace with Redis-backed rate limiting (e.g. @upstash/ratelimit).
 */

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 60;
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // Unix timestamp in seconds
}

// Use globalThis to survive HMR in development (same pattern as RunCoordinator/EventBus)
const store: Map<string, RateLimitEntry> =
  (globalThis as any).__publicApiRateLimitStore ??= new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter(
        (ts) => now - ts < DEFAULT_WINDOW_MS,
      );
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
    if (store.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow Node.js to exit without waiting for this timer
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

export function checkRateLimit(
  keyHash: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
): RateLimitResult {
  ensureCleanup();

  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(keyHash);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(keyHash, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  const resetAt = Math.ceil(
    (entry.timestamps.length > 0
      ? entry.timestamps[0] + windowMs
      : now + windowMs) / 1000,
  );

  if (entry.timestamps.length >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      limit: maxRequests,
      resetAt,
    };
  }

  // Record this request
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    limit: maxRequests,
    resetAt,
  };
}

/** For testing: reset all rate limit state */
export function resetRateLimitStore() {
  store.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
