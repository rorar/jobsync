/**
 * PushChannel Tests
 *
 * Tests: dispatch to subscriptions, stale subscription cleanup (410 Gone),
 * VAPID key requirements, rate limiting, isAvailable checks.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockVapidConfigFindUnique = jest.fn();
const mockWebPushSubscriptionFindMany = jest.fn();
const mockWebPushSubscriptionCount = jest.fn();
const mockWebPushSubscriptionDelete = jest.fn().mockResolvedValue({});
const mockSmtpConfigFindFirst = jest.fn().mockResolvedValue(null);

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    vapidConfig: {
      findUnique: (...args: unknown[]) => mockVapidConfigFindUnique(...args),
    },
    webPushSubscription: {
      findMany: (...args: unknown[]) => mockWebPushSubscriptionFindMany(...args),
      count: (...args: unknown[]) => mockWebPushSubscriptionCount(...args),
      delete: (...args: unknown[]) => mockWebPushSubscriptionDelete(...args),
    },
    smtpConfig: {
      findFirst: (...args: unknown[]) => mockSmtpConfigFindFirst(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Encryption mock
// ---------------------------------------------------------------------------

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((_encrypted: string, _iv: string) => "decrypted-key-value"),
}));

// ---------------------------------------------------------------------------
// Push rate limit mock
// ---------------------------------------------------------------------------

const mockCheckPushDispatchRateLimit = jest.fn();

jest.mock("@/lib/push/rate-limit", () => ({
  checkPushDispatchRateLimit: (...args: unknown[]) =>
    mockCheckPushDispatchRateLimit(...args),
}));

// ---------------------------------------------------------------------------
// web-push mock — WebPushError MUST be defined inside the factory
// because jest.mock() is hoisted above all variable/class declarations
// ---------------------------------------------------------------------------

const mockSendNotification = jest.fn().mockResolvedValue({});

jest.mock("web-push", () => {
  class _WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = "WebPushError";
      this.statusCode = statusCode;
    }
  }
  return {
    __esModule: true,
    default: {
      sendNotification: (...args: unknown[]) => mockSendNotification(...args),
    },
    WebPushError: _WebPushError,
  };
});

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import { PushChannel } from "@/lib/notifications/channels/push.channel";
import type { NotificationDraft } from "@/lib/notifications/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-push-test-1";

const VAPID_CONFIG = {
  userId: TEST_USER_ID,
  publicKey: "BPublicKeyBase64",
  privateKey: "encrypted-private-key",
  iv: "vapid-iv",
};

const SUBSCRIPTION_1 = {
  id: "sub-1",
  endpoint: "https://push.example.com/sub1",
  p256dh: "encrypted-p256dh-1",
  auth: "encrypted-auth-1",
  iv: "iv-p256dh-1|iv-auth-1",
};

const SUBSCRIPTION_2 = {
  id: "sub-2",
  endpoint: "https://push.example.com/sub2",
  p256dh: "encrypted-p256dh-2",
  auth: "encrypted-auth-2",
  iv: "iv-p256dh-2|iv-auth-2",
};

const NOTIFICATION: NotificationDraft = {
  userId: TEST_USER_ID,
  type: "vacancy_promoted",
  message: "A vacancy was promoted",
  data: { jobTitle: "Developer" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PushChannel", () => {
  let channel: PushChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    channel = new PushChannel();

    // Default happy-path mocks
    mockCheckPushDispatchRateLimit.mockReturnValue({ allowed: true });
    mockVapidConfigFindUnique.mockResolvedValue(VAPID_CONFIG);
    mockWebPushSubscriptionFindMany.mockResolvedValue([SUBSCRIPTION_1]);
    mockSendNotification.mockResolvedValue({});
    mockSmtpConfigFindFirst.mockResolvedValue(null);
  });

  // -----------------------------------------------------------------------
  // dispatch()
  // -----------------------------------------------------------------------

  describe("dispatch()", () => {
    it("sends to all subscriptions", async () => {
      mockWebPushSubscriptionFindMany.mockResolvedValue([
        SUBSCRIPTION_1,
        SUBSCRIPTION_2,
      ]);

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({ success: true, channel: "push" });
      expect(mockSendNotification).toHaveBeenCalledTimes(2);

      // Verify payload structure
      const firstCallPayload = JSON.parse(
        mockSendNotification.mock.calls[0][1] as string,
      );
      expect(firstCallPayload).toEqual({
        title: "JobSync",
        body: NOTIFICATION.message,
        url: "/dashboard",
        tag: NOTIFICATION.type,
      });

      // Verify VAPID details
      expect(mockSendNotification.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          vapidDetails: expect.objectContaining({
            publicKey: VAPID_CONFIG.publicKey,
          }),
        }),
      );
    });

    it("deletes stale subscription on 410 Gone", async () => {
      // Use the mocked WebPushError class from the mock factory
      const { WebPushError: MockWebPushError } = jest.requireMock("web-push") as {
        WebPushError: new (message: string, statusCode: number) => Error & { statusCode: number };
      };
      const goneError = new MockWebPushError("Gone", 410);

      mockSendNotification.mockRejectedValue(goneError);

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      // With only one subscription failing with 410, no success — all errors
      expect(result.channel).toBe("push");

      // Verify stale subscription was deleted
      expect(mockWebPushSubscriptionDelete).toHaveBeenCalledWith({
        where: { id: SUBSCRIPTION_1.id, userId: TEST_USER_ID },
      });
    });

    // F4: 401/403 VAPID auth failure — subscription preserved
    it("should NOT delete subscription on 401 VAPID auth failure", async () => {
      const { WebPushError: MockWebPushError } = jest.requireMock("web-push") as {
        WebPushError: new (message: string, statusCode: number) => Error & { statusCode: number };
      };
      const authError = new MockWebPushError("Unauthorized", 401);

      mockSendNotification.mockRejectedValue(authError);

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result.channel).toBe("push");
      expect(result.success).toBe(false);
      expect(result.error).toContain("VAPID auth failure (401)");
      // Subscription must NOT be deleted on 401 — it is a server config issue
      expect(mockWebPushSubscriptionDelete).not.toHaveBeenCalled();
    });

    it("should NOT delete subscription on 403 VAPID auth failure", async () => {
      const { WebPushError: MockWebPushError } = jest.requireMock("web-push") as {
        WebPushError: new (message: string, statusCode: number) => Error & { statusCode: number };
      };
      const forbiddenError = new MockWebPushError("Forbidden", 403);

      mockSendNotification.mockRejectedValue(forbiddenError);

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result.channel).toBe("push");
      expect(result.success).toBe(false);
      expect(result.error).toContain("VAPID auth failure (403)");
      // Subscription must NOT be deleted on 403 — it is a server config issue
      expect(mockWebPushSubscriptionDelete).not.toHaveBeenCalled();
    });

    it("should delete subscription on 404 Not Found", async () => {
      const { WebPushError: MockWebPushError } = jest.requireMock("web-push") as {
        WebPushError: new (message: string, statusCode: number) => Error & { statusCode: number };
      };
      const notFoundError = new MockWebPushError("Not Found", 404);

      mockSendNotification.mockRejectedValue(notFoundError);

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result.channel).toBe("push");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Subscription expired (404)");
      // 404 means the subscription endpoint no longer exists — delete it
      expect(mockWebPushSubscriptionDelete).toHaveBeenCalledWith({
        where: { id: SUBSCRIPTION_1.id, userId: TEST_USER_ID },
      });
    });

    it("returns failure when no VAPID keys", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(null);

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({ success: false, channel: "push", error: "No VAPID keys configured" });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("returns failure when no subscriptions", async () => {
      mockWebPushSubscriptionFindMany.mockResolvedValue([]);

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({ success: false, channel: "push", error: "No push subscriptions" });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("returns failure when rate limited", async () => {
      mockCheckPushDispatchRateLimit.mockReturnValue({
        allowed: false,
        retryAfterMs: 30000,
      });

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({
        success: false,
        channel: "push",
        error: "Rate limited",
      });
      expect(mockVapidConfigFindUnique).not.toHaveBeenCalled();
    });

    it("returns failure when VAPID private key decryption fails", async () => {
      const { decrypt } = jest.requireMock("@/lib/encryption");
      decrypt.mockImplementationOnce(() => {
        throw new Error("Decryption error");
      });

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({
        success: false,
        channel: "push",
        error: "VAPID key decryption failed",
      });
    });

    it("returns success if at least one subscription succeeds", async () => {
      mockWebPushSubscriptionFindMany.mockResolvedValue([
        SUBSCRIPTION_1,
        SUBSCRIPTION_2,
      ]);

      // First succeeds, second fails
      mockSendNotification
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("Push failed"));

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({ success: true, channel: "push" });
    });

    it("returns failure when all subscriptions fail", async () => {
      mockWebPushSubscriptionFindMany.mockResolvedValue([
        SUBSCRIPTION_1,
        SUBSCRIPTION_2,
      ]);

      mockSendNotification
        .mockRejectedValueOnce(new Error("Push failed 1"))
        .mockRejectedValueOnce(new Error("Push failed 2"));

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result.success).toBe(false);
      expect(result.channel).toBe("push");
      expect(result.error).toContain("Push failed 1");
      expect(result.error).toContain("Push failed 2");
    });
  });

  // -----------------------------------------------------------------------
  // isAvailable()
  // -----------------------------------------------------------------------

  describe("isAvailable()", () => {
    it("returns true when VAPID keys AND subscriptions exist", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(VAPID_CONFIG);
      mockWebPushSubscriptionCount.mockResolvedValue(2);

      const available = await channel.isAvailable(TEST_USER_ID);

      expect(available).toBe(true);
    });

    it("returns false when no VAPID keys", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(null);
      mockWebPushSubscriptionCount.mockResolvedValue(2);

      const available = await channel.isAvailable(TEST_USER_ID);

      expect(available).toBe(false);
    });

    it("returns false when no subscriptions", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(VAPID_CONFIG);
      mockWebPushSubscriptionCount.mockResolvedValue(0);

      const available = await channel.isAvailable(TEST_USER_ID);

      expect(available).toBe(false);
    });
  });
});
