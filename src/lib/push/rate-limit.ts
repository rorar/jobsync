import "server-only";

import { createSlidingWindowLimiter } from "../rate-limit";

/**
 * Push Notification Rate Limiter — sliding window.
 *
 * Two limits:
 * - Test push: 1 per 60 seconds per user
 * - Push dispatch: 20 per minute per user (channel-level)
 *
 * Thin wrapper over the shared sliding-window factory.
 * See src/lib/rate-limit.ts for the INBOUND vs OUTBOUND boundary docs.
 */

export interface PushRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

const testPushLimiter = createSlidingWindowLimiter({
  storeKey: "pushTestRateLimit",
  maxRequests: 1,
  windowMs: 60_000, // 60 seconds
});

const pushDispatchLimiter = createSlidingWindowLimiter({
  storeKey: "pushDispatchRateLimit",
  maxRequests: 20,
  windowMs: 60_000, // 1 minute
});

/**
 * Check test push rate limit: 1 test push per 60 seconds per user.
 */
export function checkTestPushRateLimit(userId: string): PushRateLimitResult {
  return testPushLimiter.check(`test:${userId}`);
}

/**
 * Check push dispatch rate limit: 20 pushes per minute per user.
 */
export function checkPushDispatchRateLimit(
  userId: string,
): PushRateLimitResult {
  return pushDispatchLimiter.check(userId);
}

/**
 * Reset all push rate limit state (for testing).
 */
export function resetPushRateLimitStores(): void {
  testPushLimiter.reset();
  pushDispatchLimiter.reset();
}
