/**
 * Push Server Actions Tests
 *
 * Tests: getVapidPublicKeyAction, subscribePush, unsubscribePush,
 * getSubscriptionCount, rotateVapidKeysAction, sendTestPush.
 * Covers: IDOR protection, input validation, encryption, rate limiting,
 * subscription limit, and translated test push (F3 regression).
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockWebPushSubscriptionCount = jest.fn();
const mockWebPushSubscriptionFindFirst = jest.fn();
const mockWebPushSubscriptionFindMany = jest.fn();
const mockWebPushSubscriptionUpsert = jest.fn();
const mockWebPushSubscriptionDelete = jest.fn();
const mockVapidConfigFindUnique = jest.fn();
const mockUserSettingsFindUnique = jest.fn();
const mockSmtpConfigFindFirst = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    webPushSubscription: {
      count: (...args: unknown[]) => mockWebPushSubscriptionCount(...args),
      findFirst: (...args: unknown[]) =>
        mockWebPushSubscriptionFindFirst(...args),
      findMany: (...args: unknown[]) =>
        mockWebPushSubscriptionFindMany(...args),
      upsert: (...args: unknown[]) => mockWebPushSubscriptionUpsert(...args),
      delete: (...args: unknown[]) => mockWebPushSubscriptionDelete(...args),
    },
    vapidConfig: {
      findUnique: (...args: unknown[]) => mockVapidConfigFindUnique(...args),
    },
    userSettings: {
      findUnique: (...args: unknown[]) => mockUserSettingsFindUnique(...args),
    },
    smtpConfig: {
      findFirst: (...args: unknown[]) => mockSmtpConfigFindFirst(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Auth mock
// ---------------------------------------------------------------------------

const mockGetCurrentUser = jest.fn();

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

// ---------------------------------------------------------------------------
// Encryption mock
// ---------------------------------------------------------------------------

const mockEncrypt = jest.fn().mockReturnValue({
  encrypted: "encrypted-value",
  iv: "test-iv",
});
const mockDecrypt = jest.fn().mockReturnValue("decrypted-key-value");

jest.mock("@/lib/encryption", () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

// ---------------------------------------------------------------------------
// VAPID mock
// ---------------------------------------------------------------------------

const mockGetOrCreateVapidKeys = jest.fn();
const mockRotateVapidKeys = jest.fn();
const mockResolveVapidSubject = jest.fn().mockResolvedValue("mailto:noreply@jobsync.local");

jest.mock("@/lib/push/vapid", () => ({
  getOrCreateVapidKeys: (...args: unknown[]) =>
    mockGetOrCreateVapidKeys(...args),
  rotateVapidKeys: (...args: unknown[]) => mockRotateVapidKeys(...args),
  resolveVapidSubject: (...args: unknown[]) =>
    mockResolveVapidSubject(...args),
}));

// ---------------------------------------------------------------------------
// Push rate limit mock
// ---------------------------------------------------------------------------

const mockCheckTestPushRateLimit = jest.fn();

jest.mock("@/lib/push/rate-limit", () => ({
  checkTestPushRateLimit: (...args: unknown[]) =>
    mockCheckTestPushRateLimit(...args),
}));

// ---------------------------------------------------------------------------
// Locale resolver mock
// ---------------------------------------------------------------------------

const mockResolveUserLocale = jest.fn().mockResolvedValue("en");

jest.mock("@/lib/locale-resolver", () => ({
  resolveUserLocale: (...args: unknown[]) =>
    mockResolveUserLocale(...args),
}));

// ---------------------------------------------------------------------------
// web-push mock
// ---------------------------------------------------------------------------

const mockSendNotification = jest.fn().mockResolvedValue({});

jest.mock("web-push", () => ({
  __esModule: true,
  default: {
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

// ---------------------------------------------------------------------------
// i18n mocks
// ---------------------------------------------------------------------------

const mockT = jest.fn((_locale: string, key: string) => `translated:${key}`);

jest.mock("@/i18n/server", () => ({
  t: (...args: unknown[]) => mockT(...(args as [string, string])),
}));

jest.mock("@/i18n/locales", () => ({
  DEFAULT_LOCALE: "en",
  isValidLocale: jest.fn((code: string) =>
    ["en", "de", "fr", "es"].includes(code),
  ),
}));

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import {
  getVapidPublicKeyAction,
  subscribePush,
  unsubscribePush,
  getSubscriptionCount,
  rotateVapidKeysAction,
  sendTestPush,
} from "@/actions/push.actions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: "user-push-test-1",
  name: "Test",
  email: "test@example.com",
};

const VALID_SUBSCRIPTION_INPUT = {
  endpoint: "https://push.example.com/sub/abc123",
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1eFnDi...",
    auth: "tBHItJI5svbpC7...",
  },
};

const VAPID_KEYS = {
  publicKey: "BPublicKeyBase64Test",
  privateKey: "privateKeyValue",
};

const VAPID_CONFIG = {
  userId: TEST_USER.id,
  publicKey: "BPublicKeyBase64Test",
  privateKey: "encrypted-private-key",
  iv: "vapid-iv",
};

const SUBSCRIPTION_RECORD = {
  id: "sub-1",
  endpoint: "https://push.example.com/sub1",
  p256dh: "encrypted-p256dh",
  auth: "encrypted-auth",
  iv: "iv-p256dh|iv-auth",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Push Actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(TEST_USER);
    mockCheckTestPushRateLimit.mockReturnValue({ allowed: true });
    mockUserSettingsFindUnique.mockResolvedValue(null);
    mockSmtpConfigFindFirst.mockResolvedValue(null);
  });

  // =========================================================================
  // getVapidPublicKeyAction
  // =========================================================================

  describe("getVapidPublicKeyAction()", () => {
    it("returns only the public key", async () => {
      mockGetOrCreateVapidKeys.mockResolvedValue(VAPID_KEYS);

      const result = await getVapidPublicKeyAction();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ publicKey: VAPID_KEYS.publicKey });
      // Must NOT expose private key
      expect(result.data).not.toHaveProperty("privateKey");
    });

    it("calls getOrCreateVapidKeys with session userId", async () => {
      mockGetOrCreateVapidKeys.mockResolvedValue(VAPID_KEYS);

      await getVapidPublicKeyAction();

      expect(mockGetOrCreateVapidKeys).toHaveBeenCalledWith(TEST_USER.id);
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await getVapidPublicKeyAction();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
    });
  });

  // =========================================================================
  // subscribePush
  // =========================================================================

  describe("subscribePush()", () => {
    beforeEach(() => {
      mockWebPushSubscriptionCount.mockResolvedValue(0);
      mockWebPushSubscriptionUpsert.mockResolvedValue({ id: "sub-new" });
    });

    it("validates https prefix on endpoint", async () => {
      const result = await subscribePush({
        ...VALID_SUBSCRIPTION_INPUT,
        endpoint: "http://insecure.example.com/sub",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.invalidEndpoint");
    });

    it("rejects empty endpoint", async () => {
      const result = await subscribePush({
        ...VALID_SUBSCRIPTION_INPUT,
        endpoint: "",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.invalidEndpoint");
    });

    it("rejects missing p256dh key", async () => {
      const result = await subscribePush({
        ...VALID_SUBSCRIPTION_INPUT,
        keys: { p256dh: "", auth: "some-auth" },
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.invalidKeys");
    });

    it("rejects missing auth key", async () => {
      const result = await subscribePush({
        ...VALID_SUBSCRIPTION_INPUT,
        keys: { p256dh: "some-p256dh", auth: "" },
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.invalidKeys");
    });

    it("encrypts both p256dh and auth keys", async () => {
      await subscribePush(VALID_SUBSCRIPTION_INPUT);

      // encrypt should be called for p256dh and auth separately
      expect(mockEncrypt).toHaveBeenCalledTimes(2);
      expect(mockEncrypt).toHaveBeenCalledWith(
        VALID_SUBSCRIPTION_INPUT.keys.p256dh,
      );
      expect(mockEncrypt).toHaveBeenCalledWith(
        VALID_SUBSCRIPTION_INPUT.keys.auth,
      );
    });

    it("respects 10-subscription limit (rejects new when at limit)", async () => {
      mockWebPushSubscriptionCount.mockResolvedValue(10);
      mockWebPushSubscriptionFindFirst.mockResolvedValue(null); // not an existing endpoint

      const result = await subscribePush(VALID_SUBSCRIPTION_INPUT);

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.tooManySubscriptions");
    });

    it("allows re-subscription to existing endpoint at limit", async () => {
      mockWebPushSubscriptionCount.mockResolvedValue(10);
      mockWebPushSubscriptionFindFirst.mockResolvedValue({
        id: "sub-existing",
      });
      mockWebPushSubscriptionUpsert.mockResolvedValue({ id: "sub-existing" });

      const result = await subscribePush(VALID_SUBSCRIPTION_INPUT);

      expect(result.success).toBe(true);
    });

    it("upserts by userId + endpoint composite key", async () => {
      await subscribePush(VALID_SUBSCRIPTION_INPUT);

      expect(mockWebPushSubscriptionUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_endpoint: {
              userId: TEST_USER.id,
              endpoint: VALID_SUBSCRIPTION_INPUT.endpoint,
            },
          },
          create: expect.objectContaining({
            userId: TEST_USER.id,
            endpoint: VALID_SUBSCRIPTION_INPUT.endpoint,
          }),
          update: expect.objectContaining({
            p256dh: "encrypted-value",
            auth: "encrypted-value",
          }),
        }),
      );
    });

    it("IDOR protection: uses session userId in count query", async () => {
      await subscribePush(VALID_SUBSCRIPTION_INPUT);

      expect(mockWebPushSubscriptionCount).toHaveBeenCalledWith({
        where: { userId: TEST_USER.id },
      });
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await subscribePush(VALID_SUBSCRIPTION_INPUT);

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
    });

    it("stores combined IVs with pipe separator", async () => {
      mockEncrypt
        .mockReturnValueOnce({ encrypted: "enc-p256dh", iv: "iv-p256dh" })
        .mockReturnValueOnce({ encrypted: "enc-auth", iv: "iv-auth" });

      await subscribePush(VALID_SUBSCRIPTION_INPUT);

      expect(mockWebPushSubscriptionUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            iv: "iv-p256dh|iv-auth",
          }),
          update: expect.objectContaining({
            iv: "iv-p256dh|iv-auth",
          }),
        }),
      );
    });
  });

  // =========================================================================
  // unsubscribePush
  // =========================================================================

  describe("unsubscribePush()", () => {
    it("deletes subscription by userId + endpoint", async () => {
      mockWebPushSubscriptionDelete.mockResolvedValue({});

      const endpoint = "https://push.example.com/sub/abc123";
      const result = await unsubscribePush(endpoint);

      expect(result.success).toBe(true);
      expect(mockWebPushSubscriptionDelete).toHaveBeenCalledWith({
        where: {
          userId_endpoint: {
            userId: TEST_USER.id,
            endpoint,
          },
        },
      });
    });

    it("IDOR protection: uses session userId", async () => {
      mockWebPushSubscriptionDelete.mockResolvedValue({});

      await unsubscribePush("https://push.example.com/sub/abc");

      expect(mockWebPushSubscriptionDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId_endpoint: expect.objectContaining({
              userId: TEST_USER.id,
            }),
          }),
        }),
      );
    });

    it("rejects empty endpoint", async () => {
      const result = await unsubscribePush("");

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.invalidEndpoint");
    });

    it("succeeds even when subscription already deleted", async () => {
      mockWebPushSubscriptionDelete.mockRejectedValue(
        new Error("Record not found"),
      );

      const result = await unsubscribePush("https://push.example.com/sub/x");

      expect(result.success).toBe(true);
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await unsubscribePush("https://push.example.com/sub/x");

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
    });
  });

  // =========================================================================
  // getSubscriptionCount
  // =========================================================================

  describe("getSubscriptionCount()", () => {
    it("returns count of subscriptions", async () => {
      mockWebPushSubscriptionCount.mockResolvedValue(3);

      const result = await getSubscriptionCount();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ count: 3 });
    });

    it("IDOR protection: queries by session userId", async () => {
      mockWebPushSubscriptionCount.mockResolvedValue(0);

      await getSubscriptionCount();

      expect(mockWebPushSubscriptionCount).toHaveBeenCalledWith({
        where: { userId: TEST_USER.id },
      });
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await getSubscriptionCount();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
    });
  });

  // =========================================================================
  // rotateVapidKeysAction
  // =========================================================================

  describe("rotateVapidKeysAction()", () => {
    it("rotates keys and returns new public key", async () => {
      mockRotateVapidKeys.mockResolvedValue({
        publicKey: "BNewPublicKey",
      });

      const result = await rotateVapidKeysAction();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ publicKey: "BNewPublicKey" });
    });

    it("calls rotateVapidKeys with session userId", async () => {
      mockRotateVapidKeys.mockResolvedValue({ publicKey: "BNewPublicKey" });

      await rotateVapidKeysAction();

      expect(mockRotateVapidKeys).toHaveBeenCalledWith(TEST_USER.id);
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await rotateVapidKeysAction();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
    });
  });

  // =========================================================================
  // sendTestPush
  // =========================================================================

  describe("sendTestPush()", () => {
    beforeEach(() => {
      mockVapidConfigFindUnique.mockResolvedValue(VAPID_CONFIG);
      mockWebPushSubscriptionFindMany.mockResolvedValue([SUBSCRIPTION_RECORD]);
      mockSendNotification.mockResolvedValue({});
      mockDecrypt.mockReturnValue("decrypted-key-value");
    });

    it("sends test notification to all subscriptions", async () => {
      const result = await sendTestPush();

      expect(result.success).toBe(true);
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    it("loads VAPID config with userId (IDOR protection)", async () => {
      await sendTestPush();

      expect(mockVapidConfigFindUnique).toHaveBeenCalledWith({
        where: { userId: TEST_USER.id },
      });
    });

    it("loads subscriptions with userId (IDOR protection)", async () => {
      await sendTestPush();

      expect(mockWebPushSubscriptionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: TEST_USER.id },
        }),
      );
    });

    it("respects rate limit (1 per 60s)", async () => {
      mockCheckTestPushRateLimit.mockReturnValue({
        allowed: false,
        retryAfterMs: 30000,
      });

      const result = await sendTestPush();

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.testRateLimited");
      expect(mockVapidConfigFindUnique).not.toHaveBeenCalled();
    });

    it("returns failure when no VAPID config exists", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(null);

      const result = await sendTestPush();

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.noSubscriptions");
    });

    it("returns failure when no subscriptions exist", async () => {
      mockWebPushSubscriptionFindMany.mockResolvedValue([]);

      const result = await sendTestPush();

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.noSubscriptions");
    });

    it("returns failure when VAPID key decryption fails", async () => {
      mockDecrypt.mockImplementationOnce(() => {
        throw new Error("Decryption error");
      });

      const result = await sendTestPush();

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.testFailed");
    });

    it("returns failure when all sends fail", async () => {
      mockSendNotification.mockRejectedValue(new Error("Push failed"));

      const result = await sendTestPush();

      expect(result.success).toBe(false);
      expect(result.message).toBe("push.testFailed");
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await sendTestPush();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
    });

    // -----------------------------------------------------------------------
    // F3: Regression — translated test push message
    // -----------------------------------------------------------------------

    it("[F3 regression] sends TRANSLATED message, not raw i18n key", async () => {
      await sendTestPush();

      // Verify t() was called to translate the push body
      expect(mockT).toHaveBeenCalledWith(
        expect.any(String), // locale
        "settings.pushTestBody",
      );

      // Verify the push payload body contains the translated value,
      // NOT the raw i18n key
      const pushPayload = JSON.parse(
        mockSendNotification.mock.calls[0][1] as string,
      );
      expect(pushPayload.body).toBe("translated:settings.pushTestBody");
      expect(pushPayload.body).not.toBe("settings.pushTestBody");
      expect(pushPayload.body).not.toBe("push.testBody");
    });

    it("[F3 regression] push payload has correct structure", async () => {
      await sendTestPush();

      const pushPayload = JSON.parse(
        mockSendNotification.mock.calls[0][1] as string,
      );
      expect(pushPayload).toEqual({
        title: "JobSync",
        body: expect.any(String),
        url: "/dashboard",
        tag: "vacancy_promoted",
      });
    });

    it("decrypts subscription keys before sending", async () => {
      await sendTestPush();

      // decrypt is called for: VAPID private key, p256dh, auth
      expect(mockDecrypt).toHaveBeenCalledTimes(3);
    });

    it("passes VAPID details to sendNotification", async () => {
      await sendTestPush();

      expect(mockSendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: SUBSCRIPTION_RECORD.endpoint,
          keys: expect.objectContaining({
            p256dh: "decrypted-key-value",
            auth: "decrypted-key-value",
          }),
        }),
        expect.any(String), // payload
        expect.objectContaining({
          vapidDetails: expect.objectContaining({
            publicKey: VAPID_CONFIG.publicKey,
          }),
        }),
      );
    });
  });
});
