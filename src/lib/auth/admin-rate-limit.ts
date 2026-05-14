import "server-only";

import { createSlidingWindowLimiter } from "../rate-limit";

/**
 * Admin Action Rate Limiter — Sprint 1.5 CRIT-S-04 remediation.
 *
 * Protects the admin surface (module activation/deactivation and other
 * shared-singleton toggles) against automation-flapping attacks: even a
 * legitimate admin should not be able to toggle a module 100 times per
 * minute, which would spam notifications and churn the domain-event bus.
 *
 * Limits: 10 admin actions per minute per user.
 *
 * Thin wrapper over the shared sliding-window factory.
 * See src/lib/rate-limit.ts for the INBOUND vs OUTBOUND boundary docs.
 */

export interface AdminRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

const limiter = createSlidingWindowLimiter({
  storeKey: "adminActionRateLimit",
  maxRequests: 10,
  windowMs: 60_000, // 1 minute
});

/**
 * Check admin-action rate limit: 10 actions per minute per user.
 */
export function checkAdminActionRateLimit(userId: string): AdminRateLimitResult {
  return limiter.check(userId);
}

/**
 * Reset admin-action rate limit store (for testing).
 */
export function resetAdminActionRateLimitStore(): void {
  limiter.reset();
}
