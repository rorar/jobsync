import "server-only";

/**
 * Shared INBOUND Rate Limiter Factory — Sliding Window
 *
 * Protects the server from user/key overuse (INBOUND throttling).
 * Synchronous accept/reject decision — no backpressure, no waiting.
 *
 * NOT for OUTBOUND API call pacing — that's the TokenBucketRateLimiter
 * (src/lib/connector/rate-limiter.ts), configured per module via
 * manifest.resilience.rateLimitTokens and enforced by Cockatiel's
 * resilientFetch() in src/lib/connector/resilience.ts.
 *
 * Design: Strategy pattern for future algorithm extensibility.
 * Today: slidingWindow (timestamp array, immediate accept/reject).
 * Future: fixedWindow, leakyBucket — same interface, different internals.
 *
 * @see src/lib/connector/resilience.ts — OUTBOUND resilience (Cockatiel)
 * @see src/lib/connector/rate-limiter.ts — OUTBOUND rate pacing (TokenBucket)
 */

// =============================================================================
// Result types
// =============================================================================

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

export interface RichRateLimitResult extends RateLimitResult {
  remaining: number;
  limit: number;
  /** Unix timestamp in seconds when the current window resets */
  resetAt: number;
}

// =============================================================================
// Strategy interface
// =============================================================================

export interface RateLimitStrategy<
  TResult extends RateLimitResult = RateLimitResult,
> {
  check(key: string): TResult;
  reset(): void;
}

export interface OverridableRateLimitStrategy<
  TResult extends RateLimitResult = RateLimitResult,
> {
  /** Check with optional per-call overrides (for shared limiters like the API rate-limit) */
  check(key: string, maxRequests?: number, windowMs?: number): TResult;
  reset(): void;
}

// =============================================================================
// Config
// =============================================================================

export interface SlidingWindowConfig {
  /** Unique globalThis key for HMR survival (e.g. "__emailRateLimit") */
  storeKey: string;
  /** Max requests allowed per window */
  maxRequests: number;
  /** Window duration in ms */
  windowMs: number;
  /** Cleanup interval in ms (default: 300000 = 5min). Set 0 to disable periodic cleanup. */
  cleanupIntervalMs?: number;
  /** Max entries in store to prevent unbounded growth (default: 10000) */
  maxStoreSize?: number;
}

// =============================================================================
// Internal store types
// =============================================================================

interface TimestampEntry {
  timestamps: number[];
}

interface StoreState {
  store: Map<string, TimestampEntry>;
  cleanupTimer: ReturnType<typeof setInterval> | null;
}

const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes
const DEFAULT_MAX_STORE_SIZE = 10_000;

// =============================================================================
// Store management (globalThis singleton per storeKey)
// =============================================================================

function getOrCreateStore(storeKey: string): StoreState {
  const g = globalThis as Record<string, unknown>;
  const key = `__rateLimitStore_${storeKey}`;

  if (!g[key]) {
    g[key] = {
      store: new Map<string, TimestampEntry>(),
      cleanupTimer: null,
    } satisfies StoreState;
  }

  return g[key] as StoreState;
}

function ensureCleanup(
  state: StoreState,
  windowMs: number,
  cleanupIntervalMs: number,
): void {
  if (cleanupIntervalMs <= 0 || state.cleanupTimer) return;

  state.cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of state.store) {
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
      if (entry.timestamps.length === 0) {
        state.store.delete(key);
      }
    }
    if (state.store.size === 0 && state.cleanupTimer) {
      clearInterval(state.cleanupTimer);
      state.cleanupTimer = null;
    }
  }, cleanupIntervalMs);

  // Allow Node.js to exit without waiting for this timer
  if (
    state.cleanupTimer &&
    typeof state.cleanupTimer === "object" &&
    "unref" in state.cleanupTimer
  ) {
    state.cleanupTimer.unref();
  }
}

function resetStore(state: StoreState): void {
  state.store.clear();
  if (state.cleanupTimer) {
    clearInterval(state.cleanupTimer);
    state.cleanupTimer = null;
  }
}

// =============================================================================
// Core sliding window algorithm
// =============================================================================

function slidingWindowCheck(
  state: StoreState,
  key: string,
  maxRequests: number,
  windowMs: number,
  maxStoreSize: number,
): { allowed: boolean; timestamps: number[]; oldestInWindow?: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = state.store.get(key);
  if (!entry) {
    // Evict oldest entry if at capacity (LRU approximation via Map insertion order)
    if (state.store.size >= maxStoreSize) {
      const firstKey = state.store.keys().next().value;
      if (firstKey !== undefined) {
        state.store.delete(firstKey);
      }
    }
    entry = { timestamps: [] };
    state.store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= maxRequests) {
    return {
      allowed: false,
      timestamps: entry.timestamps,
      oldestInWindow: entry.timestamps[0],
    };
  }

  // Record this request
  entry.timestamps.push(now);
  return { allowed: true, timestamps: entry.timestamps };
}

// =============================================================================
// Factory: Simple sliding window limiter
// =============================================================================

/**
 * Create a sliding-window rate limiter with simple `{ allowed, retryAfterMs }` results.
 *
 * Use for: server actions, notification channels, admin gates — anywhere
 * that needs a quick accept/reject without HTTP header metadata.
 */
export function createSlidingWindowLimiter(
  config: SlidingWindowConfig,
): RateLimitStrategy<RateLimitResult> {
  const {
    storeKey,
    maxRequests,
    windowMs,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    maxStoreSize = DEFAULT_MAX_STORE_SIZE,
  } = config;

  const state = getOrCreateStore(storeKey);

  return {
    check(key: string): RateLimitResult {
      ensureCleanup(state, windowMs, cleanupIntervalMs);

      const result = slidingWindowCheck(
        state,
        key,
        maxRequests,
        windowMs,
        maxStoreSize,
      );

      if (!result.allowed && result.oldestInWindow !== undefined) {
        const retryAfterMs =
          result.oldestInWindow + windowMs - Date.now();
        return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
      }

      return { allowed: true };
    },

    reset(): void {
      resetStore(state);
    },
  };
}

// =============================================================================
// Factory: Rich sliding window limiter (with remaining/limit/resetAt)
// =============================================================================

/**
 * Create a sliding-window rate limiter with rich results including
 * `remaining`, `limit`, and `resetAt` — for API routes that return
 * rate-limit headers (X-RateLimit-Remaining, X-RateLimit-Reset, etc.).
 *
 * Supports per-call overrides of maxRequests and windowMs for shared
 * limiters (e.g. API rate-limit used by both key-based and IP-based checks).
 */
export function createRichSlidingWindowLimiter(
  config: SlidingWindowConfig,
): OverridableRateLimitStrategy<RichRateLimitResult> {
  const {
    storeKey,
    maxRequests: defaultMaxRequests,
    windowMs: defaultWindowMs,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    maxStoreSize = DEFAULT_MAX_STORE_SIZE,
  } = config;

  const state = getOrCreateStore(storeKey);

  return {
    check(
      key: string,
      maxRequests: number = defaultMaxRequests,
      windowMs: number = defaultWindowMs,
    ): RichRateLimitResult {
      ensureCleanup(state, defaultWindowMs, cleanupIntervalMs);

      const result = slidingWindowCheck(
        state,
        key,
        maxRequests,
        windowMs,
        maxStoreSize,
      );

      const now = Date.now();
      const resetAt = Math.ceil(
        (result.timestamps.length > 0
          ? result.timestamps[0] + windowMs
          : now + windowMs) / 1000,
      );

      if (!result.allowed) {
        const retryAfterMs =
          result.oldestInWindow !== undefined
            ? result.oldestInWindow + windowMs - now
            : 0;
        return {
          allowed: false,
          remaining: 0,
          limit: maxRequests,
          resetAt,
          retryAfterMs: Math.max(retryAfterMs, 0),
        };
      }

      return {
        allowed: true,
        remaining: maxRequests - result.timestamps.length,
        limit: maxRequests,
        resetAt,
      };
    },

    reset(): void {
      resetStore(state);
    },
  };
}
