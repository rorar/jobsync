/**
 * Export Rate Limit Tests
 *
 * Tests: sliding window rate limiting for user data export (1 per hour).
 * Uses real in-memory implementation — no mocking needed.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

import {
  checkExportRateLimit,
  resetExportRateLimitStore,
} from "@/lib/export-rate-limit";

describe("Export Rate Limit", () => {
  beforeEach(() => {
    resetExportRateLimitStore();
  });

  afterAll(() => {
    resetExportRateLimitStore();
  });

  // -------------------------------------------------------------------------
  // checkExportRateLimit — 1 export per hour
  // -------------------------------------------------------------------------

  describe("checkExportRateLimit", () => {
    const userId = "user-export-1";

    it("allows first export attempt", () => {
      const result = checkExportRateLimit(userId);

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    });

    it("rejects second export within 1 hour with retryAfterMs", () => {
      // First export — allowed
      checkExportRateLimit(userId);

      // Second export — blocked
      const result = checkExportRateLimit(userId);

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeDefined();
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(0);
      // retryAfterMs should be close to 1 hour (3600000ms) minus elapsed time
      expect(result.retryAfterMs!).toBeLessThanOrEqual(60 * 60 * 1000);
    });

    it("allows export again after the 1-hour window expires", () => {
      const realDateNow = Date.now;
      let timeOffset = 0;
      Date.now = () => realDateNow() + timeOffset;

      try {
        // First export
        checkExportRateLimit(userId);

        // Blocked immediately
        expect(checkExportRateLimit(userId).allowed).toBe(false);

        // Advance time past the 1-hour window
        timeOffset = 60 * 60 * 1000 + 1000; // 1 hour + 1 second

        // Should be allowed again
        const result = checkExportRateLimit(userId);
        expect(result.allowed).toBe(true);
      } finally {
        Date.now = realDateNow;
      }
    });

    it("tracks users independently", () => {
      const userId2 = "user-export-2";

      // Exhaust user 1
      checkExportRateLimit(userId);
      expect(checkExportRateLimit(userId).allowed).toBe(false);

      // User 2 should still be allowed
      expect(checkExportRateLimit(userId2).allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // resetExportRateLimitStore
  // -------------------------------------------------------------------------

  describe("resetExportRateLimitStore", () => {
    it("clears all state so a previously blocked user can export again", () => {
      const userId = "user-export-reset";

      // Use the slot
      checkExportRateLimit(userId);
      expect(checkExportRateLimit(userId).allowed).toBe(false);

      // Reset
      resetExportRateLimitStore();

      // Now allowed again
      const result = checkExportRateLimit(userId);
      expect(result.allowed).toBe(true);
    });
  });
});
