/**
 * Unit tests for auth-rate-limit.ts
 *
 * Tests the IP-based sliding window rate limiter for signin and signup.
 * Follows the same test pattern as admin-rate-limit tests.
 */

// Mock "server-only" — not available in test environment
jest.mock("server-only", () => ({}));

// Mock next/headers
const mockHeaders = new Map<string, string>();
jest.mock("next/headers", () => ({
  headers: jest.fn(async () => ({
    get: (key: string) => mockHeaders.get(key) ?? null,
  })),
}));

import {
  checkAuthRateLimit,
  getClientIp,
  resetAuthRateLimitStore,
  type AuthRateLimitResult,
} from "@/lib/auth/auth-rate-limit";

describe("checkAuthRateLimit", () => {
  beforeEach(() => {
    resetAuthRateLimitStore();
  });

  describe("signin limits", () => {
    it("allows the first signin attempt", () => {
      const result = checkAuthRateLimit("1.2.3.4", "signin");
      expect(result.allowed).toBe(true);
    });

    it("allows up to 5 signin attempts", () => {
      for (let i = 0; i < 5; i++) {
        const result = checkAuthRateLimit("1.2.3.4", "signin");
        expect(result.allowed).toBe(true);
      }
    });

    it("blocks the 6th signin attempt", () => {
      for (let i = 0; i < 5; i++) {
        checkAuthRateLimit("1.2.3.4", "signin");
      }
      const result = checkAuthRateLimit("1.2.3.4", "signin");
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("tracks different IPs independently", () => {
      for (let i = 0; i < 5; i++) {
        checkAuthRateLimit("1.2.3.4", "signin");
      }
      // Different IP should still be allowed
      const result = checkAuthRateLimit("5.6.7.8", "signin");
      expect(result.allowed).toBe(true);
    });
  });

  describe("signup limits", () => {
    it("allows the first signup attempt", () => {
      const result = checkAuthRateLimit("1.2.3.4", "signup");
      expect(result.allowed).toBe(true);
    });

    it("allows up to 3 signup attempts", () => {
      for (let i = 0; i < 3; i++) {
        const result = checkAuthRateLimit("1.2.3.4", "signup");
        expect(result.allowed).toBe(true);
      }
    });

    it("blocks the 4th signup attempt", () => {
      for (let i = 0; i < 3; i++) {
        checkAuthRateLimit("1.2.3.4", "signup");
      }
      const result = checkAuthRateLimit("1.2.3.4", "signup");
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe("action isolation", () => {
    it("signin and signup limits are independent", () => {
      // Exhaust signin limit
      for (let i = 0; i < 5; i++) {
        checkAuthRateLimit("1.2.3.4", "signin");
      }
      expect(checkAuthRateLimit("1.2.3.4", "signin").allowed).toBe(false);

      // Signup should still be allowed
      expect(checkAuthRateLimit("1.2.3.4", "signup").allowed).toBe(true);
    });
  });

  describe("retryAfterMs", () => {
    it("returns retryAfterMs when blocked", () => {
      for (let i = 0; i < 5; i++) {
        checkAuthRateLimit("1.2.3.4", "signin");
      }
      const result = checkAuthRateLimit("1.2.3.4", "signin");
      expect(result.allowed).toBe(false);
      expect(typeof result.retryAfterMs).toBe("number");
      expect(result.retryAfterMs).toBeGreaterThan(0);
      // Should be <= 15 minutes (signin window)
      expect(result.retryAfterMs).toBeLessThanOrEqual(15 * 60 * 1000);
    });

    it("does not return retryAfterMs when allowed", () => {
      const result = checkAuthRateLimit("1.2.3.4", "signin");
      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    });
  });

  describe("window expiry", () => {
    it("allows attempts again after window expires", () => {
      const now = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(now);

      // Exhaust signin limit
      for (let i = 0; i < 5; i++) {
        checkAuthRateLimit("1.2.3.4", "signin");
      }
      expect(checkAuthRateLimit("1.2.3.4", "signin").allowed).toBe(false);

      // Advance time past 15-minute window
      jest.spyOn(Date, "now").mockReturnValue(now + 15 * 60 * 1000 + 1);

      const result = checkAuthRateLimit("1.2.3.4", "signin");
      expect(result.allowed).toBe(true);

      jest.restoreAllMocks();
    });
  });

  describe("resetAuthRateLimitStore", () => {
    it("clears all rate limit state", () => {
      for (let i = 0; i < 5; i++) {
        checkAuthRateLimit("1.2.3.4", "signin");
      }
      expect(checkAuthRateLimit("1.2.3.4", "signin").allowed).toBe(false);

      resetAuthRateLimitStore();

      expect(checkAuthRateLimit("1.2.3.4", "signin").allowed).toBe(true);
    });
  });
});

describe("getClientIp", () => {
  beforeEach(() => {
    mockHeaders.clear();
  });

  it("extracts IP from X-Forwarded-For (first entry)", async () => {
    mockHeaders.set("x-forwarded-for", "1.2.3.4, 10.0.0.1, 172.16.0.1");
    const ip = await getClientIp();
    expect(ip).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP", async () => {
    mockHeaders.set("x-real-ip", "5.6.7.8");
    const ip = await getClientIp();
    expect(ip).toBe("5.6.7.8");
  });

  it("returns 'unknown' when no IP headers present", async () => {
    const ip = await getClientIp();
    expect(ip).toBe("unknown");
  });

  it("prefers X-Forwarded-For over X-Real-IP", async () => {
    mockHeaders.set("x-forwarded-for", "1.2.3.4");
    mockHeaders.set("x-real-ip", "5.6.7.8");
    const ip = await getClientIp();
    expect(ip).toBe("1.2.3.4");
  });

  it("trims whitespace from X-Forwarded-For entries", async () => {
    mockHeaders.set("x-forwarded-for", "  1.2.3.4  , 10.0.0.1");
    const ip = await getClientIp();
    expect(ip).toBe("1.2.3.4");
  });
});
