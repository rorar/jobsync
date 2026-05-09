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
 * Follows the admin-rate-limit.ts pattern: in-memory Map on globalThis (HMR-safe).
 */

import { headers } from "next/headers";

const SIGNIN_WINDOW_MS = 15 * 60_000; // 15 minutes
const SIGNIN_MAX_ATTEMPTS = 5;
const SIGNUP_WINDOW_MS = 60 * 60_000; // 60 minutes
const SIGNUP_MAX_ATTEMPTS = 3;

interface RateLimitEntry {
  timestamps: number[];
}

export interface AuthRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

const g = globalThis as unknown as {
  __authRateLimitStore?: Map<string, RateLimitEntry>;
};

if (!g.__authRateLimitStore) {
  g.__authRateLimitStore = new Map<string, RateLimitEntry>();
}

const store = g.__authRateLimitStore;

/**
 * Check auth rate limit for signin or signup.
 */
export function checkAuthRateLimit(
  ip: string,
  action: "signin" | "signup",
): AuthRateLimitResult {
  const windowMs = action === "signin" ? SIGNIN_WINDOW_MS : SIGNUP_WINDOW_MS;
  const maxAttempts = action === "signin" ? SIGNIN_MAX_ATTEMPTS : SIGNUP_MAX_ATTEMPTS;
  const key = `${action}:${ip}`;

  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  if (entry.timestamps.length >= maxAttempts) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Extract client IP from request headers.
 * Order: X-Forwarded-For (first entry) → X-Real-IP → "unknown".
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Reset auth rate limit store (for testing).
 */
export function resetAuthRateLimitStore(): void {
  store.clear();
}
