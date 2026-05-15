import "server-only";

/**
 * Health Check Rate Limiter — In-memory sliding window rate limiting.
 *
 * Limits: 10 health checks per minute per user.
 * Protects external EU APIs from excessive probing via the Check All button.
 *
 * Thin wrapper over the shared sliding-window factory.
 * See src/lib/rate-limit.ts for the INBOUND vs OUTBOUND boundary docs.
 */

import { createSlidingWindowLimiter, type RateLimitResult } from "@/lib/rate-limit";

export type HealthRateLimitResult = RateLimitResult;

const limiter = createSlidingWindowLimiter({
  storeKey: "healthCheckRateLimit",
  maxRequests: 10,
  windowMs: 60_000, // 1 minute
  maxStoreSize: 10_000,
});

/**
 * Check health check rate limit: 10 checks per minute per user.
 */
export function checkHealthCheckRateLimit(userId: string): HealthRateLimitResult {
  return limiter.check(userId);
}

/**
 * Reset health check rate limit state (for testing).
 */
export function resetHealthCheckRateLimitStore(): void {
  limiter.reset();
}
