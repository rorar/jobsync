/**
 * Unit tests for src/lib/encryption.ts
 *
 * Tests: encrypt/decrypt roundtrip, legacy salt backward compat,
 * error handling, derived-key LRU cache, getLast4, cache helpers.
 */

// Disable server-only check in test environment
jest.mock("server-only", () => ({}));

// Spy on pbkdf2 to verify caching — use jest.requireActual inside the factory
const pbkdf2Spy = jest.fn();

jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return {
    ...actual,
    pbkdf2: (...args: unknown[]) => {
      pbkdf2Spy();
      return actual.pbkdf2(...args);
    },
  };
});

import {
  encrypt,
  decrypt,
  getLast4,
  _clearDerivedKeyCache,
  _getDerivedKeyCacheSize,
} from "@/lib/encryption";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const TEST_ENCRYPTION_KEY = "test-encryption-key-that-is-long-enough-32chars!";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
});

afterAll(() => {
  delete process.env.ENCRYPTION_KEY;
});

beforeEach(() => {
  _clearDerivedKeyCache();
  pbkdf2Spy.mockClear();
});

// ---------------------------------------------------------------------------
// encrypt()
// ---------------------------------------------------------------------------

describe("encrypt", () => {
  it("returns salted format with salt prefix", async () => {
    const result = await encrypt("my-secret-value");

    expect(result.encrypted).toMatch(/^salt:[0-9a-f]{32}:/);
    expect(result.iv).toBeTruthy();
    // IV should be base64
    expect(() => Buffer.from(result.iv, "base64")).not.toThrow();
  });

  it("returns base64 IV", async () => {
    const result = await encrypt("test");
    const ivBuffer = Buffer.from(result.iv, "base64");
    expect(ivBuffer.length).toBe(12); // IV_LENGTH
  });

  it("produces different salts for each call", async () => {
    const r1 = await encrypt("same-input");
    const r2 = await encrypt("same-input");

    // Extract salts
    const salt1 = r1.encrypted.split(":")[1];
    const salt2 = r2.encrypted.split(":")[1];
    expect(salt1).not.toBe(salt2);
  });

  it("produces different ciphertext for same plaintext", async () => {
    const r1 = await encrypt("same-input");
    const r2 = await encrypt("same-input");

    expect(r1.encrypted).not.toBe(r2.encrypted);
    expect(r1.iv).not.toBe(r2.iv);
  });
});

// ---------------------------------------------------------------------------
// decrypt()
// ---------------------------------------------------------------------------

describe("decrypt", () => {
  it("roundtrips: encrypt then decrypt recovers plaintext", async () => {
    const plaintext = "my-api-key-12345";
    const { encrypted, iv } = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted, iv);

    expect(decrypted).toBe(plaintext);
  });

  it("roundtrips with unicode content", async () => {
    const plaintext = "Schlüssel mit Ümlauten 🔑";
    const { encrypted, iv } = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted, iv);

    expect(decrypted).toBe(plaintext);
  });

  it("roundtrips with empty string", async () => {
    const { encrypted, iv } = await encrypt("");
    const decrypted = await decrypt(encrypted, iv);

    expect(decrypted).toBe("");
  });

  it("roundtrips with long content", async () => {
    const plaintext = "a".repeat(10_000);
    const { encrypted, iv } = await encrypt(plaintext);
    const decrypted = await decrypt(encrypted, iv);

    expect(decrypted).toBe(plaintext);
  });

  it("throws on corrupted encrypted data", async () => {
    const { iv } = await encrypt("test");
    await expect(decrypt("salt:0000000000000000:corrupted!", iv)).rejects.toThrow();
  });

  it("throws on wrong IV", async () => {
    const { encrypted } = await encrypt("test");
    const wrongIv = Buffer.from("wrong-iv-12b").toString("base64");
    await expect(decrypt(encrypted, wrongIv)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Legacy salt backward compatibility
// ---------------------------------------------------------------------------

describe("legacy salt format", () => {
  it("decrypts legacy-format data (no salt: prefix)", async () => {
    // Manually encrypt with the legacy salt to create a legacy record
    const crypto = jest.requireActual("crypto");
    const { promisify } = jest.requireActual("util");
    const pbkdf2Fn = promisify(crypto.pbkdf2);

    const legacySalt = "jobsync-api-key-encryption";
    const key = await pbkdf2Fn(TEST_ENCRYPTION_KEY, legacySalt, 100_000, 32, "sha256");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });

    let enc = cipher.update("legacy-secret", "utf8", "base64");
    enc += cipher.final("base64");
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([Buffer.from(enc, "base64"), authTag]).toString("base64");

    // Legacy format: no "salt:" prefix
    const decrypted = await decrypt(combined, iv.toString("base64"));
    expect(decrypted).toBe("legacy-secret");
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("throws when ENCRYPTION_KEY is not set (encrypt)", async () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    await expect(encrypt("test")).rejects.toThrow("ENCRYPTION_KEY is not set");

    process.env.ENCRYPTION_KEY = saved;
  });

  it("throws when ENCRYPTION_KEY is not set (decrypt)", async () => {
    // First encrypt with key set
    const { encrypted, iv } = await encrypt("test");

    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    await expect(decrypt(encrypted, iv)).rejects.toThrow("ENCRYPTION_KEY is not set");

    process.env.ENCRYPTION_KEY = saved;
  });
});

// ---------------------------------------------------------------------------
// Derived key cache
// ---------------------------------------------------------------------------

describe("derived key cache", () => {
  it("starts empty after clear", () => {
    _clearDerivedKeyCache();
    expect(_getDerivedKeyCacheSize()).toBe(0);
  });

  it("caches derived key — second decrypt with same salt skips pbkdf2", async () => {
    const { encrypted, iv } = await encrypt("cached-test");

    // Clear cache so first decrypt must derive
    _clearDerivedKeyCache();
    pbkdf2Spy.mockClear();

    // First decrypt: should call pbkdf2 (cache was cleared)
    await decrypt(encrypted, iv);
    expect(pbkdf2Spy).toHaveBeenCalledTimes(1);

    // Second decrypt with same encrypted data (same salt): should use cache
    pbkdf2Spy.mockClear();
    await decrypt(encrypted, iv);
    expect(pbkdf2Spy).not.toHaveBeenCalled();
  });

  it("cache grows with different salts", async () => {
    _clearDerivedKeyCache();

    const r1 = await encrypt("a");
    const r2 = await encrypt("b");
    const r3 = await encrypt("c");

    await decrypt(r1.encrypted, r1.iv);
    await decrypt(r2.encrypted, r2.iv);
    await decrypt(r3.encrypted, r3.iv);

    // 3 encrypt calls (each with unique salt) + 3 decrypt calls
    // Encrypt adds to cache, decrypt of same salt hits cache
    // So cache should have at least 3 entries (from encrypt)
    expect(_getDerivedKeyCacheSize()).toBeGreaterThanOrEqual(3);
  });

  it("_clearDerivedKeyCache empties the cache", async () => {
    await encrypt("populate-cache");
    expect(_getDerivedKeyCacheSize()).toBeGreaterThan(0);

    _clearDerivedKeyCache();
    expect(_getDerivedKeyCacheSize()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getLast4()
// ---------------------------------------------------------------------------

describe("getLast4", () => {
  it("returns last 4 characters", () => {
    expect(getLast4("my-api-key-1234")).toBe("1234");
  });

  it("returns full string when shorter than 4", () => {
    expect(getLast4("ab")).toBe("ab");
  });

  it("returns empty string for empty input", () => {
    expect(getLast4("")).toBe("");
  });
});
