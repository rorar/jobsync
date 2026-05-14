import { createRichSlidingWindowLimiter } from "../rate-limit";

/**
 * Public API Rate Limiter — sliding window for API keys and IP-based pre-auth.
 *
 * 60 requests per minute per API key (configurable per call).
 * 120 requests per minute per IP (pre-auth, configured at call site).
 *
 * LIMITATION (SEC-16): Single-process only. In multi-instance deployments
 * (Docker Compose, Kubernetes, PM2 cluster), each process maintains
 * independent state — effective rate limits become N× weaker with N instances.
 * For distributed deployments, replace with Redis-backed rate limiting
 * (e.g. @upstash/ratelimit or ioredis sliding window).
 * Accepted for self-hosted single-instance deployments.
 *
 * Thin wrapper over the shared sliding-window factory.
 * See src/lib/rate-limit.ts for the INBOUND vs OUTBOUND boundary docs.
 */

const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_WINDOW_MS = 60_000; // 1 minute

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // Unix timestamp in seconds
}

const limiter = createRichSlidingWindowLimiter({
  storeKey: "publicApiRateLimit",
  maxRequests: DEFAULT_MAX_REQUESTS,
  windowMs: DEFAULT_WINDOW_MS,
  maxStoreSize: 10_000,
});

export function checkRateLimit(
  keyHash: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
): RateLimitResult {
  return limiter.check(keyHash, maxRequests, windowMs);
}

/** For testing: reset all rate limit state */
export function resetRateLimitStore() {
  limiter.reset();
}
