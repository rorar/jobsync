import "server-only";

/**
 * Auth Rate Limiter — FL-3 security fix.
 *
 * IP-based sliding window rate limiting for signin and signup server actions.
 * Prevents brute-force credential attacks and signup abuse.
 *
 * Limits:
 *   signin: 5 attempts per 15 minutes per IP
 *   signup: 3 attempts per 60 minutes per IP
 *
 * Thin wrapper over the shared sliding-window factory.
 * See src/lib/rate-limit.ts for the INBOUND vs OUTBOUND boundary docs.
 */

import { headers } from "next/headers";
import { createSlidingWindowLimiter, type RateLimitResult } from "@/lib/rate-limit";

export type AuthRateLimitResult = RateLimitResult;

const signinLimiter = createSlidingWindowLimiter({
  storeKey: "authRateLimit_signin",
  maxRequests: 5,
  windowMs: 15 * 60_000, // 15 minutes
  maxStoreSize: 10_000,
});

const signupLimiter = createSlidingWindowLimiter({
  storeKey: "authRateLimit_signup",
  maxRequests: 3,
  windowMs: 60 * 60_000, // 60 minutes
  maxStoreSize: 10_000,
});

/**
 * Check auth rate limit for signin or signup.
 */
export function checkAuthRateLimit(
  ip: string,
  action: "signin" | "signup",
): AuthRateLimitResult {
  const limiter = action === "signin" ? signinLimiter : signupLimiter;
  return limiter.check(`${action}:${ip}`);
}

/**
 * Extract client IP from request headers.
 *
 * Uses the RIGHTMOST X-Forwarded-For entry — this is the IP added by the
 * trusted reverse proxy (SEC-09). The leftmost entry is user-controlled and
 * can be spoofed. Falls back to X-Real-IP → "unknown".
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    return parts[parts.length - 1];
  }
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Reset auth rate limit store (for testing).
 */
export function resetAuthRateLimitStore(): void {
  signinLimiter.reset();
  signupLimiter.reset();
}
