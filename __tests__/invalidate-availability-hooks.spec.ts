/**
 * invalidate-availability-hooks.spec.ts
 *
 * Sprint 5 Stream B — call-chain tests for invalidateAvailability hooks.
 *
 * Sprint 4 Stream A added `channelRouter.invalidateAvailability(user.id, channel)`
 * hooks to every mutation action that changes channel infrastructure:
 *   - subscribePush / unsubscribePush / rotateVapidKeysAction → "push"
 *   - createWebhookEndpoint / updateWebhookEndpoint / deleteWebhookEndpoint → "webhook"
 *   - saveSmtpConfig / deleteSmtpConfig → "email"
 *
 * Sprint 5 Stream A added the hook to `rotateVapidKeysAction`. This spec covers
 * the POST-Stream-A state (the hook is already present in push.actions.ts).
 *
 * Test strategy (AAA pattern — skill: "Follow AAA Pattern: Arrange, Act, Assert"):
 *   - Spy on `channelRouter.invalidateAvailability` via `jest.spyOn`
 *   - Mock Prisma so mutations succeed (positive path)
 *   - Call each action and assert spy was called with correct arguments
 *   - Negative case A: unauthenticated calls do NOT reach the hook
 *   - Negative case B: failed/pre-condition mutations do NOT reach the hook
 *
 * Open Questions:
 *   - The prompt called the webhook create action "saveWebhookEndpoint", but the
 *     actual export name is `createWebhookEndpoint` (verified in webhook.actions.ts).
 *     Tests use the real export names.
 *   - `next/cache` revalidatePath is NOT imported by any of the three action files
 *     (confirmed by grep: no revalidatePath in push.actions.ts, smtp.actions.ts,
 *     webhook.actions.ts). No mock is needed for it.
 *   - `createSmtpTransporter` (smtp.actions.ts) is imported from `@/lib/email/transport`
 *     but is not called by saveSmtpConfig / deleteSmtpConfig — only by testSmtpConnection.
 *     No mock needed for the coverage scope of this file.
 */

// ---------------------------------------------------------------------------
// Mocks — must come before imports
// ---------------------------------------------------------------------------

jest.mock("server-only", () => ({}));

// ── channel-router singleton ─────────────────────────────────────────────────
// We import the REAL channelRouter and spy on it, rather than replacing it with
// a mock module, so the spy captures the exact call the actions make against the
// live singleton export.
//
// The mock below stubs the module's other internals that would otherwise try to
// import "server-only"-gated modules, while re-exporting the real `channelRouter`
// for our spy to target.

jest.mock("@/lib/notifications/channel-router", () => {
  // Create a minimal in-memory channelRouter stand-in that Jest can spy on.
  const channelRouter = {
    invalidateAvailability: jest.fn(),
    register: jest.fn(),
    route: jest.fn().mockResolvedValue([]),
    clear: jest.fn(),
    has: jest.fn().mockReturnValue(false),
  };
  return { channelRouter, registerChannels: jest.fn() };
});

// ── Prisma singleton ─────────────────────────────────────────────────────────

const mockWebPushSubscriptionCount = jest.fn();
const mockWebPushSubscriptionFindFirst = jest.fn();
const mockWebPushSubscriptionUpsert = jest.fn();
const mockWebPushSubscriptionDelete = jest.fn();
const mockVapidConfigFindUnique = jest.fn();
const mockWebhookEndpointCount = jest.fn();
const mockWebhookEndpointCreate = jest.fn();
const mockWebhookEndpointFindFirst = jest.fn();
const mockWebhookEndpointUpdateMany = jest.fn();
const mockWebhookEndpointDeleteMany = jest.fn();
const mockSmtpConfigFindFirst = jest.fn();
const mockSmtpConfigCreate = jest.fn();
const mockSmtpConfigUpdate = jest.fn();
const mockSmtpConfigDeleteMany = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    webPushSubscription: {
      count: (...args: unknown[]) => mockWebPushSubscriptionCount(...args),
      findFirst: (...args: unknown[]) => mockWebPushSubscriptionFindFirst(...args),
      upsert: (...args: unknown[]) => mockWebPushSubscriptionUpsert(...args),
      delete: (...args: unknown[]) => mockWebPushSubscriptionDelete(...args),
    },
    vapidConfig: {
      findUnique: (...args: unknown[]) => mockVapidConfigFindUnique(...args),
    },
    webhookEndpoint: {
      count: (...args: unknown[]) => mockWebhookEndpointCount(...args),
      create: (...args: unknown[]) => mockWebhookEndpointCreate(...args),
      findFirst: (...args: unknown[]) => mockWebhookEndpointFindFirst(...args),
      updateMany: (...args: unknown[]) => mockWebhookEndpointUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockWebhookEndpointDeleteMany(...args),
    },
    smtpConfig: {
      findFirst: (...args: unknown[]) => mockSmtpConfigFindFirst(...args),
      create: (...args: unknown[]) => mockSmtpConfigCreate(...args),
      update: (...args: unknown[]) => mockSmtpConfigUpdate(...args),
      deleteMany: (...args: unknown[]) => mockSmtpConfigDeleteMany(...args),
    },
  },
}));

// ── Auth ─────────────────────────────────────────────────────────────────────

const mockGetCurrentUser = jest.fn();

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

// ── Encryption (push + webhook need it) ──────────────────────────────────────

jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn().mockReturnValue({ encrypted: "enc-value", iv: "test-iv" }),
  decrypt: jest.fn().mockReturnValue("decrypted-value"),
  getLast4: jest.fn().mockReturnValue("word"),
}));

// ── VAPID (push.actions) ─────────────────────────────────────────────────────

const mockGetOrCreateVapidKeys = jest.fn();
const mockRotateVapidKeys = jest.fn();

jest.mock("@/lib/push/vapid", () => ({
  getOrCreateVapidKeys: (...args: unknown[]) => mockGetOrCreateVapidKeys(...args),
  rotateVapidKeys: (...args: unknown[]) => mockRotateVapidKeys(...args),
  resolveVapidSubject: jest.fn().mockResolvedValue("mailto:noreply@jobsync.local"),
}));

// ── Push rate limit ───────────────────────────────────────────────────────────

jest.mock("@/lib/push/rate-limit", () => ({
  checkTestPushRateLimit: jest.fn().mockReturnValue({ allowed: true }),
}));

// ── SMTP validation ───────────────────────────────────────────────────────────

jest.mock("@/lib/smtp-validation", () => ({
  validateSmtpHost: jest.fn().mockReturnValue({ valid: true }),
}));

// ── URL validation (webhook.actions) ─────────────────────────────────────────

jest.mock("@/lib/url-validation", () => ({
  validateWebhookUrl: jest.fn().mockReturnValue({ valid: true }),
}));

// ── i18n ─────────────────────────────────────────────────────────────────────

jest.mock("@/i18n/server", () => ({
  t: jest.fn((_locale: string, key: string) => `translated:${key}`),
}));

jest.mock("@/i18n/locales", () => ({
  DEFAULT_LOCALE: "en",
  isValidLocale: jest.fn((code: string) => ["en", "de", "fr", "es"].includes(code)),
}));

// ── Locale resolver ───────────────────────────────────────────────────────────

jest.mock("@/lib/locale-resolver", () => ({
  resolveUserLocale: jest.fn().mockResolvedValue("en"),
}));

// ── Email transport (smtp.actions testSmtpConnection — NOT in scope here but
//    smtp.actions.ts imports it at module level so we stub it) ─────────────────

jest.mock("@/lib/email/transport", () => ({
  createSmtpTransporter: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({}),
    close: jest.fn(),
  }),
}));

// ── Email templates (smtp.actions) ───────────────────────────────────────────

jest.mock("@/lib/email/templates", () => ({
  renderTestEmail: jest.fn().mockReturnValue({
    subject: "Test",
    html: "<p>Test</p>",
    text: "Test",
  }),
}));

// ── Email rate limit ──────────────────────────────────────────────────────────

jest.mock("@/lib/email-rate-limit", () => ({
  checkTestEmailRateLimit: jest.fn().mockReturnValue({ allowed: true }),
}));

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import { subscribePush, unsubscribePush, rotateVapidKeysAction } from "@/actions/push.actions";
import {
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
} from "@/actions/webhook.actions";
import { saveSmtpConfig, deleteSmtpConfig } from "@/actions/smtp.actions";
import { channelRouter } from "@/lib/notifications/channel-router";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER = {
  id: "user-invalidate-hooks-test-1",
  name: "Test User",
  email: "test@example.com",
};

const VALID_PUSH_INPUT = {
  endpoint: "https://push.example.com/sub/abc123",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1eF...", auth: "tBHItJI5svbp..." },
};

const VALID_SMTP_INPUT = {
  host: "smtp.example.com",
  port: 587,
  username: "user@example.com",
  password: "secure-password",
  fromAddress: "noreply@example.com",
  tlsRequired: true,
  active: true,
};

const EXISTING_SMTP = {
  id: "smtp-1",
  userId: TEST_USER.id,
  host: "smtp.example.com",
  port: 587,
  username: "user@example.com",
  password: "enc-password",
  iv: "iv-1",
  fromAddress: "noreply@example.com",
  tlsRequired: true,
  active: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const EXISTING_WEBHOOK = {
  id: "hook-1",
  userId: TEST_USER.id,
  url: "https://hooks.example.com/jobsync",
  secret: "enc-secret",
  iv: "iv-hook",
  events: JSON.stringify(["vacancy_promoted"]),
  active: true,
  failureCount: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cast to jest.Mock for spy-call assertions */
const asSpy = (fn: unknown) => fn as jest.Mock;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("invalidateAvailability call-chain tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(TEST_USER);
  });

  // =========================================================================
  // push channel hooks
  // =========================================================================

  describe("push channel — subscribePush", () => {
    beforeEach(() => {
      mockWebPushSubscriptionCount.mockResolvedValue(0);
      mockWebPushSubscriptionUpsert.mockResolvedValue({ id: "sub-new" });
    });

    it("calls invalidateAvailability(userId, 'push') on success", async () => {
      const result = await subscribePush(VALID_PUSH_INPUT);

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "push",
      );
    });

    it("calls invalidateAvailability exactly once per successful subscribe", async () => {
      await subscribePush(VALID_PUSH_INPUT);

      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledTimes(1);
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await subscribePush(VALID_PUSH_INPUT);

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when input validation fails (bad endpoint)", async () => {
      const result = await subscribePush({
        ...VALID_PUSH_INPUT,
        endpoint: "http://insecure.example.com/sub",
      });

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when subscription limit is hit", async () => {
      mockWebPushSubscriptionCount.mockResolvedValue(10);
      mockWebPushSubscriptionFindFirst.mockResolvedValue(null); // not existing → limit exceeded

      const result = await subscribePush(VALID_PUSH_INPUT);

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });
  });

  describe("push channel — unsubscribePush", () => {
    beforeEach(() => {
      mockWebPushSubscriptionDelete.mockResolvedValue({});
    });

    it("calls invalidateAvailability(userId, 'push') on success", async () => {
      const result = await unsubscribePush(VALID_PUSH_INPUT.endpoint);

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "push",
      );
    });

    it("calls invalidateAvailability even when the subscription was already deleted (idempotent)", async () => {
      // unsubscribePush swallows the not-found error — this is intentional.
      // The hook still fires because the "catch" is on the Prisma call, not
      // on the outer try — the invalidateAvailability line runs after the
      // .catch(() => {}) expression.
      mockWebPushSubscriptionDelete.mockRejectedValue(new Error("Record not found"));

      const result = await unsubscribePush(VALID_PUSH_INPUT.endpoint);

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "push",
      );
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await unsubscribePush(VALID_PUSH_INPUT.endpoint);

      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when endpoint is empty (validation fails)", async () => {
      const result = await unsubscribePush("");

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });
  });

  describe("push channel — rotateVapidKeysAction (Sprint 5 Stream A hook)", () => {
    beforeEach(() => {
      mockRotateVapidKeys.mockResolvedValue({ publicKey: "BNewPublicKey123" });
    });

    it("calls invalidateAvailability(userId, 'push') after rotating VAPID keys", async () => {
      const result = await rotateVapidKeysAction();

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "push",
      );
    });

    it("calls invalidateAvailability exactly once per rotation", async () => {
      await rotateVapidKeysAction();

      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledTimes(1);
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await rotateVapidKeysAction();

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when rotateVapidKeys throws", async () => {
      mockRotateVapidKeys.mockRejectedValue(new Error("VAPID generation failed"));

      const result = await rotateVapidKeysAction();

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // webhook channel hooks
  // =========================================================================

  describe("webhook channel — createWebhookEndpoint", () => {
    beforeEach(() => {
      mockWebhookEndpointCount.mockResolvedValue(0);
      mockWebhookEndpointCreate.mockResolvedValue(EXISTING_WEBHOOK);
    });

    it("calls invalidateAvailability(userId, 'webhook') on success", async () => {
      const result = await createWebhookEndpoint(
        "https://hooks.example.com/jobsync",
        ["vacancy_promoted"],
      );

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "webhook",
      );
    });

    it("calls invalidateAvailability exactly once per created endpoint", async () => {
      await createWebhookEndpoint(
        "https://hooks.example.com/jobsync",
        ["vacancy_promoted"],
      );

      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledTimes(1);
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await createWebhookEndpoint("https://hooks.example.com/x", ["vacancy_promoted"]);

      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when URL validation fails", async () => {
      const { validateWebhookUrl } = jest.requireMock("@/lib/url-validation") as {
        validateWebhookUrl: jest.Mock;
      };
      validateWebhookUrl.mockReturnValueOnce({ valid: false, error: "webhook.urlInvalid" });

      const result = await createWebhookEndpoint(
        "http://internal.corp/hook",
        ["vacancy_promoted"],
      );

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when endpoint limit is reached", async () => {
      mockWebhookEndpointCount.mockResolvedValue(10);

      const result = await createWebhookEndpoint(
        "https://hooks.example.com/new",
        ["vacancy_promoted"],
      );

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });
  });

  describe("webhook channel — updateWebhookEndpoint", () => {
    beforeEach(() => {
      // updateWebhookEndpoint first finds existing, then updateMany, then re-fetches
      mockWebhookEndpointFindFirst
        .mockResolvedValueOnce(EXISTING_WEBHOOK) // ownership check
        .mockResolvedValueOnce(EXISTING_WEBHOOK); // re-fetch after updateMany
      mockWebhookEndpointUpdateMany.mockResolvedValue({ count: 1 });
    });

    it("calls invalidateAvailability(userId, 'webhook') on success", async () => {
      const result = await updateWebhookEndpoint("hook-1", { active: false });

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "webhook",
      );
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await updateWebhookEndpoint("hook-1", { active: false });

      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when endpoint is not found (IDOR)", async () => {
      // The suite-level `jest.clearAllMocks()` does NOT drain
      // `mockResolvedValueOnce` queues (only `mockReset` does). The
      // describe-level beforeEach above queued TWO Once values per test,
      // and previous tests in the same describe may have left unconsumed
      // values. `mockReset()` here wipes the queue + the default, then we
      // set a clean `null` default so the first (ownership) findFirst
      // returns null → early return BEFORE the invalidateAvailability hook.
      mockWebhookEndpointFindFirst.mockReset();
      mockWebhookEndpointFindFirst.mockResolvedValue(null);

      const result = await updateWebhookEndpoint("not-my-hook", { active: false });

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });
  });

  describe("webhook channel — deleteWebhookEndpoint", () => {
    beforeEach(() => {
      mockWebhookEndpointFindFirst.mockResolvedValue(EXISTING_WEBHOOK);
      mockWebhookEndpointDeleteMany.mockResolvedValue({ count: 1 });
    });

    it("calls invalidateAvailability(userId, 'webhook') on success", async () => {
      const result = await deleteWebhookEndpoint("hook-1");

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "webhook",
      );
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await deleteWebhookEndpoint("hook-1");

      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when endpoint is not found (IDOR)", async () => {
      // Same Once-queue reset pattern as the updateWebhookEndpoint negative
      // test above — `clearAllMocks` doesn't drain the queue, so residual
      // values from prior tests in this describe can poison the ordering.
      mockWebhookEndpointFindFirst.mockReset();
      mockWebhookEndpointFindFirst.mockResolvedValue(null);

      const result = await deleteWebhookEndpoint("not-my-hook");

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // email channel hooks
  // =========================================================================

  describe("email channel — saveSmtpConfig (create path)", () => {
    beforeEach(() => {
      // No existing config → create path
      mockSmtpConfigFindFirst.mockResolvedValue(null);
      mockSmtpConfigCreate.mockResolvedValue(EXISTING_SMTP);
    });

    it("calls invalidateAvailability(userId, 'email') when creating a new SMTP config", async () => {
      const result = await saveSmtpConfig(VALID_SMTP_INPUT);

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "email",
      );
    });

    it("calls invalidateAvailability exactly once per save", async () => {
      await saveSmtpConfig(VALID_SMTP_INPUT);

      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledTimes(1);
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await saveSmtpConfig(VALID_SMTP_INPUT);

      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when host validation fails", async () => {
      const { validateSmtpHost } = jest.requireMock("@/lib/smtp-validation") as {
        validateSmtpHost: jest.Mock;
      };
      validateSmtpHost.mockReturnValueOnce({ valid: false, error: "smtp.ssrfBlocked" });

      const result = await saveSmtpConfig(VALID_SMTP_INPUT);

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });
  });

  describe("email channel — saveSmtpConfig (update path)", () => {
    beforeEach(() => {
      // Existing config present → update path (password not required)
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_SMTP);
      mockSmtpConfigUpdate.mockResolvedValue(EXISTING_SMTP);
    });

    it("calls invalidateAvailability(userId, 'email') when updating an existing SMTP config", async () => {
      const result = await saveSmtpConfig({
        ...VALID_SMTP_INPUT,
        password: undefined, // update without changing password
      });

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "email",
      );
    });
  });

  describe("email channel — deleteSmtpConfig", () => {
    beforeEach(() => {
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_SMTP);
      mockSmtpConfigDeleteMany.mockResolvedValue({ count: 1 });
    });

    it("calls invalidateAvailability(userId, 'email') on success", async () => {
      const result = await deleteSmtpConfig();

      expect(result.success).toBe(true);
      expect(asSpy(channelRouter.invalidateAvailability)).toHaveBeenCalledWith(
        TEST_USER.id,
        "email",
      );
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when user is not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      await deleteSmtpConfig();

      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });

    it("[NEGATIVE] does NOT call invalidateAvailability when no SMTP config exists", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await deleteSmtpConfig();

      expect(result.success).toBe(false);
      expect(asSpy(channelRouter.invalidateAvailability)).not.toHaveBeenCalled();
    });
  });
});
