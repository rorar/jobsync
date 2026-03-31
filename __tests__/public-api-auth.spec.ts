/**
 * Unit tests for Public API Key authentication middleware.
 * Tests: key extraction, hashing, validation, and rate limiting.
 */
import { hashApiKey, generateApiKey, getKeyPrefix } from "@/lib/api/auth";
import { checkRateLimit, resetRateLimitStore } from "@/lib/api/rate-limit";

// --- hashApiKey ---

describe("hashApiKey", () => {
  it("returns a 64-char hex SHA-256 digest", () => {
    const hash = hashApiKey("pk_live_test1234567890abcdef12345678");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different keys", () => {
    const h1 = hashApiKey("pk_live_aaa");
    const h2 = hashApiKey("pk_live_bbb");
    expect(h1).not.toBe(h2);
  });

  it("produces the same hash for the same key", () => {
    const key = "pk_live_test1234567890abcdef12345678";
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });
});

// --- generateApiKey ---

describe("generateApiKey", () => {
  it("starts with pk_live_ prefix", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^pk_live_/);
  });

  it("is 48 characters long", () => {
    const key = generateApiKey();
    expect(key.length).toBe(48); // "pk_live_" (8) + 40 hex chars
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
    expect(keys.size).toBe(10);
  });
});

// --- getKeyPrefix ---

describe("getKeyPrefix", () => {
  it("returns first 12 characters", () => {
    const key = "pk_live_abcd1234567890";
    expect(getKeyPrefix(key)).toBe("pk_live_abcd");
  });
});

// --- Rate Limiting ---

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("allows requests within the limit", () => {
    const result = checkRateLimit("test-key", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
  });

  it("blocks requests exceeding the limit", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("test-key", 5, 60_000);
    }
    const result = checkRateLimit("test-key", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks limits per key independently", () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit("key-a", 5, 60_000);
    }
    // key-a is exhausted
    expect(checkRateLimit("key-a", 5, 60_000).allowed).toBe(false);
    // key-b still has capacity
    expect(checkRateLimit("key-b", 5, 60_000).allowed).toBe(true);
  });

  it("resets after the window expires", () => {
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now);

    for (let i = 0; i < 5; i++) {
      checkRateLimit("test-key", 5, 1000); // 1 second window
    }
    expect(checkRateLimit("test-key", 5, 1000).allowed).toBe(false);

    // Advance time past the window
    (Date.now as jest.Mock).mockReturnValue(now + 1001);
    expect(checkRateLimit("test-key", 5, 1000).allowed).toBe(true);

    (Date.now as jest.Mock).mockRestore();
  });

  it("returns a valid resetAt timestamp", () => {
    const result = checkRateLimit("test-key", 60, 60_000);
    expect(result.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});
