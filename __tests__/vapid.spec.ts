/**
 * VAPID Key Management Tests
 *
 * Tests: getOrCreateVapidKeys, rotateVapidKeys, getVapidPublicKey.
 * Mocks Prisma, encryption, and web-push.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockVapidConfigFindUnique = jest.fn();
const mockVapidConfigCreate = jest.fn();
const mockVapidConfigDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const mockWebPushSubscriptionDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const mockTransaction = jest.fn().mockImplementation((queries: unknown[]) => Promise.all(queries as Promise<unknown>[]));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    vapidConfig: {
      findUnique: (...args: unknown[]) => mockVapidConfigFindUnique(...args),
      create: (...args: unknown[]) => mockVapidConfigCreate(...args),
      deleteMany: (...args: unknown[]) => mockVapidConfigDeleteMany(...args),
    },
    webPushSubscription: {
      deleteMany: (...args: unknown[]) =>
        mockWebPushSubscriptionDeleteMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// ---------------------------------------------------------------------------
// Encryption mock
// ---------------------------------------------------------------------------

const mockEncrypt = jest.fn().mockReturnValue({
  encrypted: "encrypted-private-key",
  iv: "generated-iv",
});
const mockDecrypt = jest.fn().mockReturnValue("decrypted-private-key");

jest.mock("@/lib/encryption", () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

// ---------------------------------------------------------------------------
// web-push mock
// ---------------------------------------------------------------------------

const mockGenerateVAPIDKeys = jest.fn().mockReturnValue({
  publicKey: "BGeneratedPublicKey",
  privateKey: "generated-private-key-raw",
});

jest.mock("web-push", () => ({
  __esModule: true,
  default: {
    generateVAPIDKeys: (...args: unknown[]) => mockGenerateVAPIDKeys(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import {
  getOrCreateVapidKeys,
  getVapidPublicKey,
  rotateVapidKeys,
} from "@/lib/push/vapid";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-vapid-test-1";

const EXISTING_VAPID_CONFIG = {
  userId: TEST_USER_ID,
  publicKey: "BExistingPublicKey",
  privateKey: "encrypted-existing-private",
  iv: "existing-iv",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VAPID Key Management", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getOrCreateVapidKeys
  // -----------------------------------------------------------------------

  describe("getOrCreateVapidKeys()", () => {
    it("creates new keys when none exist", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(null);
      mockVapidConfigCreate.mockResolvedValue({
        userId: TEST_USER_ID,
        publicKey: "BGeneratedPublicKey",
        privateKey: "encrypted-private-key",
        iv: "generated-iv",
      });

      const result = await getOrCreateVapidKeys(TEST_USER_ID);

      expect(result).toEqual({
        publicKey: "BGeneratedPublicKey",
        privateKey: "generated-private-key-raw",
      });

      // Verify generation was called
      expect(mockGenerateVAPIDKeys).toHaveBeenCalledTimes(1);

      // Verify encryption of private key
      expect(mockEncrypt).toHaveBeenCalledWith("generated-private-key-raw");

      // Verify DB create with encrypted private key
      expect(mockVapidConfigCreate).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          publicKey: "BGeneratedPublicKey",
          privateKey: "encrypted-private-key",
          iv: "generated-iv",
        },
      });
    });

    it("returns existing keys (decrypted) when they exist", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(EXISTING_VAPID_CONFIG);

      const result = await getOrCreateVapidKeys(TEST_USER_ID);

      expect(result).toEqual({
        publicKey: "BExistingPublicKey",
        privateKey: "decrypted-private-key",
      });

      // Should decrypt the stored private key
      expect(mockDecrypt).toHaveBeenCalledWith(
        "encrypted-existing-private",
        "existing-iv",
      );

      // Should NOT generate new keys
      expect(mockGenerateVAPIDKeys).not.toHaveBeenCalled();
      expect(mockVapidConfigCreate).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // getVapidPublicKey
  // -----------------------------------------------------------------------

  describe("getVapidPublicKey()", () => {
    it("returns public key when config exists", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(EXISTING_VAPID_CONFIG);

      const publicKey = await getVapidPublicKey(TEST_USER_ID);

      expect(publicKey).toBe("BExistingPublicKey");
      expect(mockVapidConfigFindUnique).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
      });
    });

    it("returns null when no config exists", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(null);

      const publicKey = await getVapidPublicKey(TEST_USER_ID);

      expect(publicKey).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // rotateVapidKeys
  // -----------------------------------------------------------------------

  describe("rotateVapidKeys()", () => {
    it("deletes subscriptions and old config, then creates new keys", async () => {
      // First call to findUnique (inside rotateVapidKeys -> getOrCreateVapidKeys): no existing
      mockVapidConfigFindUnique.mockResolvedValue(null);
      mockVapidConfigCreate.mockResolvedValue({
        userId: TEST_USER_ID,
        publicKey: "BGeneratedPublicKey",
        privateKey: "encrypted-private-key",
        iv: "generated-iv",
      });

      const result = await rotateVapidKeys(TEST_USER_ID);

      expect(result).toEqual({ publicKey: "BGeneratedPublicKey" });

      // Verify $transaction was called with deleteMany queries
      expect(mockTransaction).toHaveBeenCalledTimes(1);

      // Verify subscriptions and config were deleted via transaction
      expect(mockWebPushSubscriptionDeleteMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
      });
      expect(mockVapidConfigDeleteMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
      });

      // Verify new keys were generated
      expect(mockGenerateVAPIDKeys).toHaveBeenCalledTimes(1);
      expect(mockVapidConfigCreate).toHaveBeenCalledTimes(1);
    });

    it("handles missing old config gracefully (deleteMany returns count 0)", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(null);
      // deleteMany with no matching records returns { count: 0 } — never throws
      mockVapidConfigDeleteMany.mockResolvedValue({ count: 0 });
      mockWebPushSubscriptionDeleteMany.mockResolvedValue({ count: 0 });
      mockVapidConfigCreate.mockResolvedValue({
        userId: TEST_USER_ID,
        publicKey: "BGeneratedPublicKey",
        privateKey: "encrypted-private-key",
        iv: "generated-iv",
      });

      // Should not throw — deleteMany is idempotent (no-op when missing)
      const result = await rotateVapidKeys(TEST_USER_ID);

      expect(result).toEqual({ publicKey: "BGeneratedPublicKey" });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });
  });
});
