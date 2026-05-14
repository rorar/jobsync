import "server-only";

import { createSlidingWindowLimiter } from "./rate-limit";

/**
 * Export Rate Limiter — 1 export per hour per user.
 *
 * Thin wrapper over the shared sliding-window factory.
 * See src/lib/rate-limit.ts for the INBOUND vs OUTBOUND boundary docs.
 */

export interface ExportRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

const limiter = createSlidingWindowLimiter({
  storeKey: "exportRateLimit",
  maxRequests: 1,
  windowMs: 60 * 60 * 1000, // 1 hour
});

/**
 * Check export rate limit: 1 export per hour per user.
 */
export function checkExportRateLimit(userId: string): ExportRateLimitResult {
  return limiter.check(userId);
}

/**
 * Reset export rate limit state (for testing).
 */
export function resetExportRateLimitStore(): void {
  limiter.reset();
}
