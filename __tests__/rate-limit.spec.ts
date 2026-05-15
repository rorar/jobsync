/**
 * Tests for src/lib/rate-limit.ts — Shared INBOUND Rate Limiter Factory (T-1).
 *
 * Tests the core sliding window algorithm, cleanup timer lifecycle,
 * maxStoreSize eviction, RichRateLimitResult fields, per-call overrides,
 * reset(), and independent key tracking.
 */

jest.mock("server-only", () => ({}));

import {
  createSlidingWindowLimiter,
  createRichSlidingWindowLimiter,
  type RateLimitResult,
  type RichRateLimitResult,
} from "@/lib/rate-limit";

describe("createSlidingWindowLimiter", () => {
  let limiter: ReturnType<typeof createSlidingWindowLimiter>;

  beforeEach(() => {
    limiter = createSlidingWindowLimiter({
      storeKey: `test_simple_${Date.now()}_${Math.random()}`,
      maxRequests: 3,
      windowMs: 60_000,
      cleanupIntervalMs: 0, // disable auto-cleanup for test determinism
    });
  });

  afterEach(() => {
    limiter.reset();
  });

  it("allows requests within the limit", () => {
    const r1 = limiter.check("user1");
    const r2 = limiter.check("user1");
    const r3 = limiter.check("user1");

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it("rejects requests exceeding the limit", () => {
    limiter.check("user1");
    limiter.check("user1");
    limiter.check("user1");

    const result = limiter.check("user1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("tracks different keys independently", () => {
    limiter.check("user1");
    limiter.check("user1");
    limiter.check("user1");

    expect(limiter.check("user1").allowed).toBe(false);
    expect(limiter.check("user2").allowed).toBe(true);
  });

  it("allows requests again after window expires", () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);

    limiter.check("user1");
    limiter.check("user1");
    limiter.check("user1");
    expect(limiter.check("user1").allowed).toBe(false);

    // Advance past window
    jest.spyOn(Date, "now").mockReturnValue(now + 60_001);
    expect(limiter.check("user1").allowed).toBe(true);

    jest.restoreAllMocks();
  });

  it("does not return retryAfterMs when allowed", () => {
    const result = limiter.check("user1");
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBeUndefined();
  });

  it("reset() clears all state", () => {
    limiter.check("user1");
    limiter.check("user1");
    limiter.check("user1");
    expect(limiter.check("user1").allowed).toBe(false);

    limiter.reset();
    expect(limiter.check("user1").allowed).toBe(true);
  });
});

describe("createSlidingWindowLimiter — maxStoreSize eviction", () => {
  it("evicts oldest entry when store exceeds maxStoreSize", () => {
    const limiter = createSlidingWindowLimiter({
      storeKey: `test_eviction_${Date.now()}_${Math.random()}`,
      maxRequests: 10,
      windowMs: 60_000,
      cleanupIntervalMs: 0,
      maxStoreSize: 3,
    });

    // Fill store with 3 entries
    limiter.check("a");
    limiter.check("b");
    limiter.check("c");

    // This should evict "a" (oldest via Map insertion order)
    limiter.check("d");

    // "d" should work (just added), "a" counter was evicted (fresh start)
    const resultD = limiter.check("d");
    expect(resultD.allowed).toBe(true);

    // "a" was evicted — fresh entry, should be allowed
    const resultA = limiter.check("a");
    expect(resultA.allowed).toBe(true);

    limiter.reset();
  });
});

describe("createSlidingWindowLimiter — cleanup timer", () => {
  it("does not create timer when cleanupIntervalMs is 0", () => {
    const limiter = createSlidingWindowLimiter({
      storeKey: `test_no_timer_${Date.now()}_${Math.random()}`,
      maxRequests: 3,
      windowMs: 60_000,
      cleanupIntervalMs: 0,
    });

    // Should work without errors
    limiter.check("user1");
    limiter.reset();
  });

  it("creates timer on first check when cleanupIntervalMs > 0", () => {
    const spy = jest.spyOn(globalThis, "setInterval");
    const limiter = createSlidingWindowLimiter({
      storeKey: `test_timer_${Date.now()}_${Math.random()}`,
      maxRequests: 3,
      windowMs: 60_000,
      cleanupIntervalMs: 5_000,
    });

    const callsBefore = spy.mock.calls.length;
    limiter.check("user1");
    expect(spy.mock.calls.length).toBeGreaterThan(callsBefore);

    limiter.reset();
    spy.mockRestore();
  });
});

describe("createRichSlidingWindowLimiter", () => {
  let limiter: ReturnType<typeof createRichSlidingWindowLimiter>;

  beforeEach(() => {
    limiter = createRichSlidingWindowLimiter({
      storeKey: `test_rich_${Date.now()}_${Math.random()}`,
      maxRequests: 5,
      windowMs: 60_000,
      cleanupIntervalMs: 0,
    });
  });

  afterEach(() => {
    limiter.reset();
  });

  it("returns remaining count", () => {
    const r1 = limiter.check("key1");
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(4); // 5 - 1
    expect(r1.limit).toBe(5);

    const r2 = limiter.check("key1");
    expect(r2.remaining).toBe(3); // 5 - 2
  });

  it("returns limit field matching config", () => {
    const result = limiter.check("key1");
    expect(result.limit).toBe(5);
  });

  it("returns resetAt as unix timestamp in seconds", () => {
    const nowMs = Date.now();
    const result = limiter.check("key1");
    // resetAt should be ~60s from now
    expect(result.resetAt).toBeGreaterThan(Math.floor(nowMs / 1000));
    expect(result.resetAt).toBeLessThanOrEqual(Math.ceil((nowMs + 60_000) / 1000));
  });

  it("returns remaining=0 when blocked", () => {
    for (let i = 0; i < 5; i++) limiter.check("key1");
    const result = limiter.check("key1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("supports per-call maxRequests override", () => {
    // Override to only allow 2 instead of 5
    limiter.check("key1", 2);
    limiter.check("key1", 2);
    const result = limiter.check("key1", 2);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(2);
  });

  it("supports per-call windowMs override", () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);

    // Use a 10ms window
    limiter.check("key1", 1, 10);
    expect(limiter.check("key1", 1, 10).allowed).toBe(false);

    // Advance 11ms — should be allowed again
    jest.spyOn(Date, "now").mockReturnValue(now + 11);
    expect(limiter.check("key1", 1, 10).allowed).toBe(true);

    jest.restoreAllMocks();
  });
});
