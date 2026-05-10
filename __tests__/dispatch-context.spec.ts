/**
 * dispatch-context.spec.ts — Tests for buildDispatchContext()
 *
 * PERF-3: buildDispatchContext() replaces the per-channel DB queries with a
 * single upfront batch of 6 parallel Prisma reads. The result is an immutable
 * DispatchContext snapshot that carries all per-user data needed by every channel.
 *
 * Tests:
 *   1. Returns default preferences when no UserSettings row
 *   2. Returns correct locale from UserSettings
 *   3. Returns correct availability flags (email, push, webhook)
 *   4. Derives vapidSubject from smtp.fromAddress
 *   5. Falls back to default vapidSubject when no SMTP
 *   6. Runs 6 parallel queries (via Promise.all)
 *   7. Handles null user gracefully
 */

// ---------------------------------------------------------------------------
// Mocks — must precede all imports so Jest hoisting works
// ---------------------------------------------------------------------------

jest.mock("server-only", () => ({}));

// Prisma mock — per-table control
const mockUserSettingsFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();
const mockSmtpConfigFindFirst = jest.fn();
const mockVapidConfigFindUnique = jest.fn();
const mockWebPushSubscriptionFindMany = jest.fn();
const mockWebhookEndpointFindMany = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    userSettings: {
      findUnique: (...args: unknown[]) => mockUserSettingsFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    smtpConfig: {
      findFirst: (...args: unknown[]) => mockSmtpConfigFindFirst(...args),
    },
    vapidConfig: {
      findUnique: (...args: unknown[]) => mockVapidConfigFindUnique(...args),
    },
    webPushSubscription: {
      findMany: (...args: unknown[]) => mockWebPushSubscriptionFindMany(...args),
    },
    webhookEndpoint: {
      findMany: (...args: unknown[]) => mockWebhookEndpointFindMany(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import { buildDispatchContext } from "@/lib/notifications/dispatch-context";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-ctx-test-1";

const SMTP_CONFIG = {
  id: "smtp-1",
  host: "smtp.example.com",
  port: 587,
  username: "user@example.com",
  password: "encrypted-password",
  iv: "test-iv",
  fromAddress: "noreply@example.com",
  tlsRequired: true,
  active: true,
};

const VAPID_CONFIG = {
  publicKey: "BPublicKeyBase64",
  privateKey: "encrypted-private-key",
  iv: "vapid-iv",
};

const PUSH_SUBSCRIPTION = {
  id: "sub-1",
  endpoint: "https://push.example.com/sub1",
  p256dh: "encrypted-p256dh-1",
  auth: "encrypted-auth-1",
  iv: "iv-p256dh-1|iv-auth-1",
};

const WEBHOOK_ENDPOINT = {
  id: "ep-1",
  url: "https://example.com/webhook",
  secret: "encrypted-secret",
  iv: "test-iv",
  events: JSON.stringify(["vacancy_promoted"]),
  failureCount: 0,
};

function makeSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    userId: TEST_USER_ID,
    settings: JSON.stringify({
      display: { locale: "en" },
      notifications: {
        enabled: true,
        channels: { inApp: true, webhook: true, email: false, push: false },
        perType: {},
      },
      ...overrides,
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildDispatchContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default happy-path: everything returns null/empty (no config)
    mockUserSettingsFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ email: "user@example.com" });
    mockSmtpConfigFindFirst.mockResolvedValue(null);
    mockVapidConfigFindUnique.mockResolvedValue(null);
    mockWebPushSubscriptionFindMany.mockResolvedValue([]);
    mockWebhookEndpointFindMany.mockResolvedValue([]);
  });

  // =========================================================================
  // 1. Default preferences when no UserSettings row
  // =========================================================================

  describe("preferences resolution", () => {
    it("returns DEFAULT_NOTIFICATION_PREFERENCES when no UserSettings row exists", async () => {
      mockUserSettingsFindUnique.mockResolvedValue(null);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("returns stored notification preferences when they exist", async () => {
      const storedPrefs = {
        enabled: false,
        channels: { inApp: true, webhook: true, email: false, push: false },
        perType: { vacancy_promoted: { enabled: false } },
      };
      mockUserSettingsFindUnique.mockResolvedValue({
        userId: TEST_USER_ID,
        settings: JSON.stringify({ notifications: storedPrefs }),
      });

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.preferences).toEqual(storedPrefs);
    });

    it("returns defaults when settings JSON has no notifications key", async () => {
      mockUserSettingsFindUnique.mockResolvedValue({
        userId: TEST_USER_ID,
        settings: JSON.stringify({ ai: { moduleId: "ollama" } }),
      });

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("returns defaults when settings JSON is malformed", async () => {
      mockUserSettingsFindUnique.mockResolvedValue({
        userId: TEST_USER_ID,
        settings: "{ this is not valid JSON !!!",
      });

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });
  });

  // =========================================================================
  // 2. Locale resolution from UserSettings
  // =========================================================================

  describe("locale resolution", () => {
    it("returns 'en' as default locale when no UserSettings row", async () => {
      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.locale).toBe("en");
    });

    it("returns correct locale from UserSettings display.locale", async () => {
      mockUserSettingsFindUnique.mockResolvedValue({
        userId: TEST_USER_ID,
        settings: JSON.stringify({
          display: { locale: "de" },
          notifications: DEFAULT_NOTIFICATION_PREFERENCES,
        }),
      });

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.locale).toBe("de");
    });

    it("falls back to 'en' when display.locale is invalid", async () => {
      mockUserSettingsFindUnique.mockResolvedValue({
        userId: TEST_USER_ID,
        settings: JSON.stringify({
          display: { locale: "xx-invalid" },
          notifications: DEFAULT_NOTIFICATION_PREFERENCES,
        }),
      });

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.locale).toBe("en");
    });

    it("falls back to 'en' when display key is absent", async () => {
      mockUserSettingsFindUnique.mockResolvedValue({
        userId: TEST_USER_ID,
        settings: JSON.stringify({
          notifications: DEFAULT_NOTIFICATION_PREFERENCES,
        }),
      });

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.locale).toBe("en");
    });
  });

  // =========================================================================
  // 3. Availability flags
  // =========================================================================

  describe("availability flags", () => {
    it("emailAvailable is true when SMTP config exists", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(SMTP_CONFIG);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.emailAvailable).toBe(true);
    });

    it("emailAvailable is false when no SMTP config", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.emailAvailable).toBe(false);
    });

    it("pushAvailable is true when VAPID keys AND subscriptions exist", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(VAPID_CONFIG);
      mockWebPushSubscriptionFindMany.mockResolvedValue([PUSH_SUBSCRIPTION]);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.pushAvailable).toBe(true);
    });

    it("pushAvailable is false when VAPID keys exist but no subscriptions", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(VAPID_CONFIG);
      mockWebPushSubscriptionFindMany.mockResolvedValue([]);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.pushAvailable).toBe(false);
    });

    it("pushAvailable is false when no VAPID keys", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(null);
      mockWebPushSubscriptionFindMany.mockResolvedValue([PUSH_SUBSCRIPTION]);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.pushAvailable).toBe(false);
    });

    it("webhookAvailable is true when webhook endpoints exist", async () => {
      mockWebhookEndpointFindMany.mockResolvedValue([WEBHOOK_ENDPOINT]);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.webhookAvailable).toBe(true);
    });

    it("webhookAvailable is false when no webhook endpoints", async () => {
      mockWebhookEndpointFindMany.mockResolvedValue([]);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.webhookAvailable).toBe(false);
    });

    it("inAppAvailable is always true", async () => {
      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.inAppAvailable).toBe(true);
    });
  });

  // =========================================================================
  // 4. vapidSubject from smtp.fromAddress
  // =========================================================================

  describe("vapidSubject derivation", () => {
    it("derives vapidSubject from smtp.fromAddress", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(SMTP_CONFIG);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.vapidSubject).toBe("mailto:noreply@example.com");
    });

    it("falls back to default vapidSubject when no SMTP config", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.vapidSubject).toBe("mailto:noreply@jobsync.local");
    });
  });

  // =========================================================================
  // 5. Snapshot population
  // =========================================================================

  describe("snapshot population", () => {
    it("carries userId on the context", async () => {
      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.userId).toBe(TEST_USER_ID);
    });

    it("carries userEmail from the user row", async () => {
      mockUserFindUnique.mockResolvedValue({ email: "john@example.com" });

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.userEmail).toBe("john@example.com");
    });

    it("carries SMTP snapshot when config exists", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(SMTP_CONFIG);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.smtp).not.toBeNull();
      expect(ctx.smtp!.host).toBe("smtp.example.com");
      expect(ctx.smtp!.port).toBe(587);
      expect(ctx.smtp!.fromAddress).toBe("noreply@example.com");
    });

    it("carries VAPID snapshot when config exists", async () => {
      mockVapidConfigFindUnique.mockResolvedValue(VAPID_CONFIG);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.vapid).not.toBeNull();
      expect(ctx.vapid!.publicKey).toBe("BPublicKeyBase64");
    });

    it("carries push subscriptions array", async () => {
      mockWebPushSubscriptionFindMany.mockResolvedValue([PUSH_SUBSCRIPTION]);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.pushSubscriptions).toHaveLength(1);
      expect(ctx.pushSubscriptions[0].endpoint).toBe("https://push.example.com/sub1");
    });

    it("carries webhook endpoints array", async () => {
      mockWebhookEndpointFindMany.mockResolvedValue([WEBHOOK_ENDPOINT]);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.webhookEndpoints).toHaveLength(1);
      expect(ctx.webhookEndpoints[0].url).toBe("https://example.com/webhook");
    });
  });

  // =========================================================================
  // 6. Parallel query execution
  // =========================================================================

  describe("parallel queries", () => {
    it("calls all 6 Prisma queries", async () => {
      await buildDispatchContext(TEST_USER_ID);

      expect(mockUserSettingsFindUnique).toHaveBeenCalledTimes(1);
      expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
      expect(mockSmtpConfigFindFirst).toHaveBeenCalledTimes(1);
      expect(mockVapidConfigFindUnique).toHaveBeenCalledTimes(1);
      expect(mockWebPushSubscriptionFindMany).toHaveBeenCalledTimes(1);
      expect(mockWebhookEndpointFindMany).toHaveBeenCalledTimes(1);
    });

    it("passes userId to all queries", async () => {
      await buildDispatchContext(TEST_USER_ID);

      expect(mockUserSettingsFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: TEST_USER_ID } }),
      );
      expect(mockUserFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TEST_USER_ID } }),
      );
      expect(mockSmtpConfigFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: TEST_USER_ID }) }),
      );
      expect(mockVapidConfigFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: TEST_USER_ID } }),
      );
      expect(mockWebPushSubscriptionFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: TEST_USER_ID } }),
      );
      expect(mockWebhookEndpointFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: TEST_USER_ID }) }),
      );
    });
  });

  // =========================================================================
  // 7. Graceful handling of null user / DB errors
  // =========================================================================

  describe("graceful error handling", () => {
    it("handles null user gracefully (userEmail becomes null)", async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.userEmail).toBeNull();
      // The context is still valid — other fields populated with defaults
      expect(ctx.userId).toBe(TEST_USER_ID);
      expect(ctx.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    });

    it("handles DB error on userSettings gracefully (catches and returns defaults)", async () => {
      mockUserSettingsFindUnique.mockRejectedValue(new Error("DB error"));

      const ctx = await buildDispatchContext(TEST_USER_ID);

      // .catch(() => null) on the query should produce defaults
      expect(ctx.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
      expect(ctx.locale).toBe("en");
    });

    it("handles DB error on smtpConfig gracefully", async () => {
      mockSmtpConfigFindFirst.mockRejectedValue(new Error("DB error"));

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.smtp).toBeNull();
      expect(ctx.emailAvailable).toBe(false);
    });

    it("handles DB error on vapidConfig gracefully", async () => {
      mockVapidConfigFindUnique.mockRejectedValue(new Error("DB error"));

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.vapid).toBeNull();
      expect(ctx.pushAvailable).toBe(false);
    });

    it("handles DB error on webPushSubscription gracefully", async () => {
      mockWebPushSubscriptionFindMany.mockRejectedValue(new Error("DB error"));

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.pushSubscriptions).toEqual([]);
    });

    it("handles DB error on webhookEndpoint gracefully", async () => {
      mockWebhookEndpointFindMany.mockRejectedValue(new Error("DB error"));

      const ctx = await buildDispatchContext(TEST_USER_ID);

      expect(ctx.webhookEndpoints).toEqual([]);
      expect(ctx.webhookAvailable).toBe(false);
    });
  });
});
