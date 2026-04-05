/**
 * Email Rate Limit Tests
 *
 * Tests: sliding window rate limiting for email dispatch (10/min)
 * and test email (1/60s). Uses real in-memory implementation.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

import {
  checkEmailRateLimit,
  checkTestEmailRateLimit,
  resetEmailRateLimitStores,
} from "@/lib/email-rate-limit";

describe("Email Rate Limit", () => {
  beforeEach(() => {
    resetEmailRateLimitStores();
  });

  afterAll(() => {
    resetEmailRateLimitStores();
  });

  // -----------------------------------------------------------------------
  // checkEmailRateLimit — 10 emails per minute
  // -----------------------------------------------------------------------

  describe("checkEmailRateLimit", () => {
    const userId = "user-rate-limit-1";

    it("allows first email (under limit)", () => {
      const result = checkEmailRateLimit(userId);

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    });

    it("allows up to 10 emails in a window", () => {
      for (let i = 0; i < 10; i++) {
        const result = checkEmailRateLimit(userId);
        expect(result.allowed).toBe(true);
      }
    });

    it("blocks after 10 emails in 1 minute", () => {
      // Consume all 10 slots
      for (let i = 0; i < 10; i++) {
        checkEmailRateLimit(userId);
      }

      // 11th should be blocked
      const result = checkEmailRateLimit(userId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(0);
    });

    it("resets after window expires", () => {
      // Use fake timers to simulate window expiry
      const realDateNow = Date.now;
      let timeOffset = 0;
      Date.now = () => realDateNow() + timeOffset;

      try {
        // Consume all 10 slots
        for (let i = 0; i < 10; i++) {
          checkEmailRateLimit(userId);
        }

        // Blocked now
        expect(checkEmailRateLimit(userId).allowed).toBe(false);

        // Advance time past 60s window
        timeOffset = 61_000;

        // Should be allowed again
        const result = checkEmailRateLimit(userId);
        expect(result.allowed).toBe(true);
      } finally {
        Date.now = realDateNow;
      }
    });

    it("tracks users independently", () => {
      const userId2 = "user-rate-limit-2";

      // Exhaust user 1
      for (let i = 0; i < 10; i++) {
        checkEmailRateLimit(userId);
      }
      expect(checkEmailRateLimit(userId).allowed).toBe(false);

      // User 2 should still be allowed
      expect(checkEmailRateLimit(userId2).allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // checkTestEmailRateLimit — 1 test email per 60 seconds
  // -----------------------------------------------------------------------

  describe("checkTestEmailRateLimit", () => {
    const userId = "user-test-rate-1";

    it("allows first test email", () => {
      const result = checkTestEmailRateLimit(userId);

      expect(result.allowed).toBe(true);
    });

    it("blocks second test email within 60s", () => {
      checkTestEmailRateLimit(userId);

      const result = checkTestEmailRateLimit(userId);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
    });

    it("allows test email after 60s cooldown", () => {
      const realDateNow = Date.now;
      let timeOffset = 0;
      Date.now = () => realDateNow() + timeOffset;

      try {
        // First test email
        checkTestEmailRateLimit(userId);

        // Blocked immediately
        expect(checkTestEmailRateLimit(userId).allowed).toBe(false);

        // Advance past cooldown
        timeOffset = 61_000;

        // Should be allowed again
        const result = checkTestEmailRateLimit(userId);
        expect(result.allowed).toBe(true);
      } finally {
        Date.now = realDateNow;
      }
    });
  });
});
