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
 * E2E-only bypass of the auth rate limiter.
 *
 * The Playwright suite re-logs-in on every run (global-setup + the signin smoke
 * test), which legitimately trips the 5-per-15-min signin limit and makes the
 * suite flaky. This affordance disables the limiter ONLY in a controlled,
 * non-production test server — it is NOT a backdoor:
 *
 *   1. HARD prod gate: `NODE_ENV !== "production"`. A production Next.js build
 *      always sets NODE_ENV=production, so the bypass is physically inert in
 *      prod even if the flag below is set by mistake. The limiter cannot be
 *      turned off in the deployed app under any input.
 *   2. Explicit server-side opt-in: `E2E_AUTH_RATE_LIMIT_BYPASS=1`. This is a
 *      server environment variable — it is not derived from any request header,
 *      cookie, body, or query param, so an attacker has no channel to enable it.
 *   3. Default OFF and loud: absent the flag the limiter runs normally; when the
 *      bypass IS active the server logs a one-time warning so it can never be on
 *      silently.
 *
 * Set the flag only on the local/CI dev server used for E2E (see
 * scripts/dev-e2e.sh). It must never be present in a production environment.
 */
let bypassWarningLogged = false;
function isAuthRateLimitBypassed(): boolean {
  const enabled =
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_AUTH_RATE_LIMIT_BYPASS === "1";
  if (enabled && !bypassWarningLogged) {
    bypassWarningLogged = true;
    console.warn(
      "[auth-rate-limit] BYPASS ACTIVE — signin/signup rate limiting is disabled " +
        "(E2E_AUTH_RATE_LIMIT_BYPASS=1, NODE_ENV!=production). This must never be set in production.",
    );
  }
  return enabled;
}

/**
 * Check auth rate limit for signin or signup.
 */
export function checkAuthRateLimit(
  ip: string,
  action: "signin" | "signup",
): AuthRateLimitResult {
  const limiter = action === "signin" ? signinLimiter : signupLimiter;
  if (isAuthRateLimitBypassed()) {
    return { allowed: true };
  }
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
