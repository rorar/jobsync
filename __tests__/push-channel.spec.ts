/**
 * PushChannel Tests
 *
 * Tests: dispatch to subscriptions from DispatchContext snapshot, stale
 * subscription cleanup (410 Gone), VAPID key handling, rate limiting,
 * 401/403 VAPID auth failure preservation.
 *
 * PERF-3: isAvailable() removed. Availability is now a boolean flag on
 * DispatchContext (pushAvailable), checked by the ChannelRouter before
 * dispatch is called. dispatch() receives a DispatchContext snapshot
 * instead of a bare userId string. VAPID keys, subscriptions, and
 * vapidSubject are all read from the context.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Prisma mock (only for stale subscription delete — write operations)
// ---------------------------------------------------------------------------

const mockWebPushSubscriptionDelete = jest.fn().mockResolvedValue({});

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    webPushSubscription: {
      delete: (...args: unknown[]) => mockWebPushSubscriptionDelete(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Encryption mock
// ---------------------------------------------------------------------------

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((_encrypted: string, _iv: string) => Promise.resolve("decrypted-key-value")),
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
import type { DispatchContext } from "@/lib/notifications/dispatch-context";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-push-test-1";

const VAPID_SNAPSHOT = {
  publicKey: "BPublicKeyBase64",
  privateKey: "encrypted-private-key",
  iv: "vapid-iv",
} as const;

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

/**
 * Factory for building a test DispatchContext for push tests.
 */
function makeTestContext(
  overrides: Partial<DispatchContext> = {},
): DispatchContext {
  return {
    userId: TEST_USER_ID,
    preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    locale: "en",
    userEmail: "user@example.com",
    smtp: null,
    vapid: VAPID_SNAPSHOT,
    pushSubscriptions: [SUBSCRIPTION_1],
    webhookEndpoints: [],
    emailAvailable: false,
    pushAvailable: true,
    webhookAvailable: false,
    inAppAvailable: true,
    vapidSubject: "mailto:noreply@jobsync.local",
    ...overrides,
  };
}

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
    mockSendNotification.mockResolvedValue({});
  });

  // -----------------------------------------------------------------------
  // dispatch()
  // -----------------------------------------------------------------------

  describe("dispatch()", () => {
    it("sends to all subscriptions from context snapshot", async () => {
      const ctx = makeTestContext({
        pushSubscriptions: [SUBSCRIPTION_1, SUBSCRIPTION_2],
      });

      const result = await channel.dispatch(NOTIFICATION, ctx);

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
            publicKey: VAPID_SNAPSHOT.publicKey,
          }),
        }),
      );
    });

    it("uses vapidSubject from context snapshot", async () => {
      const ctx = makeTestContext({ vapidSubject: "mailto:custom@example.com" });

      await channel.dispatch(NOTIFICATION, ctx);

      expect(mockSendNotification.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          vapidDetails: expect.objectContaining({
            subject: "mailto:custom@example.com",
          }),
        }),
      );
    });

    it("deletes stale subscription on 410 Gone", async () => {
      const { WebPushError: MockWebPushError } = jest.requireMock("web-push") as {
        WebPushError: new (message: string, statusCode: number) => Error & { statusCode: number };
      };
      const goneError = new MockWebPushError("Gone", 410);

      mockSendNotification.mockRejectedValue(goneError);

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

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

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

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

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

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

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result.channel).toBe("push");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Subscription expired (404)");
      // 404 means the subscription endpoint no longer exists — delete it
      expect(mockWebPushSubscriptionDelete).toHaveBeenCalledWith({
        where: { id: SUBSCRIPTION_1.id, userId: TEST_USER_ID },
      });
    });

    it("returns failure when no VAPID keys (vapid is null on ctx)", async () => {
      const ctx = makeTestContext({ vapid: null });
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({ success: false, channel: "push", error: "No VAPID keys configured" });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("returns failure when no subscriptions (empty array on ctx)", async () => {
      const ctx = makeTestContext({ pushSubscriptions: [] });
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({ success: false, channel: "push", error: "No push subscriptions" });
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it("returns failure when rate limited", async () => {
      mockCheckPushDispatchRateLimit.mockReturnValue({
        allowed: false,
        retryAfterMs: 30000,
      });

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({
        success: false,
        channel: "push",
        error: "Rate limited",
      });
    });

    it("returns failure when VAPID private key decryption fails", async () => {
      const { decrypt } = jest.requireMock("@/lib/encryption");
      decrypt.mockRejectedValueOnce(new Error("Decryption error"));

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({
        success: false,
        channel: "push",
        error: "VAPID key decryption failed",
      });
    });

    it("returns success if at least one subscription succeeds", async () => {
      const ctx = makeTestContext({
        pushSubscriptions: [SUBSCRIPTION_1, SUBSCRIPTION_2],
      });

      // First succeeds, second fails
      mockSendNotification
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("Push failed"));

      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({ success: true, channel: "push" });
    });

    it("returns failure when all subscriptions fail", async () => {
      const ctx = makeTestContext({
        pushSubscriptions: [SUBSCRIPTION_1, SUBSCRIPTION_2],
      });

      mockSendNotification
        .mockRejectedValueOnce(new Error("Push failed 1"))
        .mockRejectedValueOnce(new Error("Push failed 2"));

      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result.success).toBe(false);
      expect(result.channel).toBe("push");
      expect(result.error).toContain("Push failed 1");
      expect(result.error).toContain("Push failed 2");
    });

    it("uses ctx.userId for rate limiting", async () => {
      const ctx = makeTestContext();
      await channel.dispatch(NOTIFICATION, ctx);

      expect(mockCheckPushDispatchRateLimit).toHaveBeenCalledWith(TEST_USER_ID);
    });
  });
});
