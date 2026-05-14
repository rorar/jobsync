import "server-only";

import { createSlidingWindowLimiter } from "./rate-limit";

/**
 * Email Rate Limiter — sliding window rate limiting for email dispatch.
 *
 * Two limits:
 * - Email dispatch: 10 emails per minute per user
 * - Test email: 1 test email per 60 seconds per user
 *
 * Thin wrapper over the shared sliding-window factory.
 * See src/lib/rate-limit.ts for the INBOUND vs OUTBOUND boundary docs.
 */

export interface EmailRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

const emailLimiter = createSlidingWindowLimiter({
  storeKey: "emailRateLimit",
  maxRequests: 10,
  windowMs: 60_000, // 1 minute
});

const testEmailLimiter = createSlidingWindowLimiter({
  storeKey: "testEmailRateLimit",
  maxRequests: 1,
  windowMs: 60_000, // 60 seconds
});

/**
 * Check email dispatch rate limit: 10 emails per minute per user.
 */
export function checkEmailRateLimit(userId: string): EmailRateLimitResult {
  return emailLimiter.check(userId);
}

/**
 * Check test email rate limit: 1 test email per 60 seconds per user.
 */
export function checkTestEmailRateLimit(userId: string): EmailRateLimitResult {
  return testEmailLimiter.check(`test:${userId}`);
}

/**
 * Reset all email rate limit state (for testing).
 */
export function resetEmailRateLimitStores(): void {
  emailLimiter.reset();
  testEmailLimiter.reset();
}
