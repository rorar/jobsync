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
const mockVapidConfigDelete = jest.fn();
const mockWebPushSubscriptionDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    vapidConfig: {
      findUnique: (...args: unknown[]) => mockVapidConfigFindUnique(...args),
      create: (...args: unknown[]) => mockVapidConfigCreate(...args),
      delete: (...args: unknown[]) => mockVapidConfigDelete(...args),
    },
    webPushSubscription: {
      deleteMany: (...args: unknown[]) =>
        mockWebPushSubscriptionDeleteMany(...args),
    },
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
      mockVapidConfigDelete.mockResolvedValue({});
      mockVapidConfigCreate.mockResolvedValue({
        userId: TEST_USER_ID,
        publicKey: "BGeneratedPublicKey",
        privateKey: "encrypted-private-key",
        iv: "generated-iv",
      });

      const result = await rotateVapidKeys(TEST_USER_ID);

      expect(result).toEqual({ publicKey: "BGeneratedPublicKey" });

      // Verify subscriptions were deleted first
      expect(mockWebPushSubscriptionDeleteMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
      });

      // Verify old config deletion was attempted
      expect(mockVapidConfigDelete).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
      });

      // Verify new keys were generated
      expect(mockGenerateVAPIDKeys).toHaveBeenCalledTimes(1);
      expect(mockVapidConfigCreate).toHaveBeenCalledTimes(1);
    });

    it("handles missing old config gracefully (delete throws)", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(null);
      mockVapidConfigDelete.mockRejectedValue(
        new Error("Record not found"),
      );
      mockVapidConfigCreate.mockResolvedValue({
        userId: TEST_USER_ID,
        publicKey: "BGeneratedPublicKey",
        privateKey: "encrypted-private-key",
        iv: "generated-iv",
      });

      // Should not throw — .catch() swallows the delete error
      const result = await rotateVapidKeys(TEST_USER_ID);

      expect(result).toEqual({ publicKey: "BGeneratedPublicKey" });
    });
  });
});
