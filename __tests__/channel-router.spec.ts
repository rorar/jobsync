/**
 * ChannelRouter Tests
 *
 * Tests: per-channel shouldNotify gating, error isolation across channels,
 * basic routing, no channels registered, channel availability via DispatchContext,
 * duplicate registration prevention, results aggregation.
 *
 * PERF-3: isAvailable() cache tests replaced by DispatchContext availability
 * flag tests. The router now reads availability synchronously from the
 * ctx.emailAvailable / ctx.pushAvailable / ctx.webhookAvailable / ctx.inAppAvailable
 * flags built by buildDispatchContext().
 *
 * Spec: specs/notification-dispatch.allium
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// shouldNotify mock — controls per-channel gating
// ---------------------------------------------------------------------------

const mockShouldNotify = jest.fn().mockReturnValue(true);

jest.mock("@/models/notification.model", () => ({
  ...jest.requireActual("@/models/notification.model"),
  shouldNotify: (...args: unknown[]) => mockShouldNotify(...args),
}));

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import { ChannelRouter } from "@/lib/notifications/channel-router";
import type {
  NotificationChannel,
  NotificationDraft,
  ChannelResult,
} from "@/lib/notifications/types";
import type { DispatchContext } from "@/lib/notifications/dispatch-context";
import type { NotificationPreferences } from "@/models/notification.model";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-42";

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  channels: { inApp: true, webhook: true, email: false, push: false },
  perType: {},
};

/**
 * Factory function for building a test DispatchContext.
 * All availability flags default to true; override as needed.
 */
function makeTestContext(
  overrides: Partial<DispatchContext> = {},
): DispatchContext {
  return {
    userId: TEST_USER_ID,
    preferences: DEFAULT_PREFS,
    locale: "en",
    userEmail: "user@example.com",
    smtp: null,
    vapid: null,
    pushSubscriptions: [],
    webhookEndpoints: [],
    emailAvailable: true,
    pushAvailable: true,
    webhookAvailable: true,
    inAppAvailable: true,
    vapidSubject: "mailto:noreply@jobsync.local",
    ...overrides,
  };
}

function makeDraft(
  overrides: Partial<NotificationDraft> = {},
): NotificationDraft {
  return {
    userId: TEST_USER_ID,
    type: "vacancy_promoted",
    message: "Job created from staged vacancy",
    data: { jobId: "job-1" },
    ...overrides,
  };
}

function makeMockChannel(
  name: string,
  overrides: Partial<{
    dispatch: jest.Mock;
  }> = {},
): NotificationChannel & { dispatch: jest.Mock } {
  return {
    name,
    dispatch:
      overrides.dispatch ??
      jest.fn<Promise<ChannelResult>, [NotificationDraft, DispatchContext]>().mockResolvedValue({
        success: true,
        channel: name,
      }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChannelRouter", () => {
  let router: ChannelRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShouldNotify.mockReturnValue(true);
    router = new ChannelRouter();
  });

  describe("basic routing", () => {
    it("routes a draft to all registered channels that pass shouldNotify + availability", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook");
      router.register(inApp);
      router.register(webhook);

      const draft = makeDraft();
      const ctx = makeTestContext();
      const result = await router.route(draft, ctx);

      expect(inApp.dispatch).toHaveBeenCalledWith(draft, ctx);
      expect(webhook.dispatch).toHaveBeenCalledWith(draft, ctx);
      expect(result.anySuccess).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ success: true, channel: "inApp" });
      expect(result.results[1]).toEqual({ success: true, channel: "webhook" });
    });

    it("passes DispatchContext to dispatch instead of userId", async () => {
      const channel = makeMockChannel("inApp");
      router.register(channel);

      const ctx = makeTestContext();
      await router.route(makeDraft(), ctx);

      // dispatch receives the full DispatchContext, not a bare userId string
      expect(channel.dispatch).toHaveBeenCalledWith(expect.any(Object), ctx);
      const passedCtx = channel.dispatch.mock.calls[0][1];
      expect(passedCtx.userId).toBe(TEST_USER_ID);
      expect(passedCtx.preferences).toBeDefined();
      expect(passedCtx.locale).toBe("en");
    });
  });

  describe("per-channel shouldNotify gating", () => {
    it("skips dispatch for channel when shouldNotify returns false", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook");
      router.register(inApp);
      router.register(webhook);

      // inApp enabled, webhook disabled
      mockShouldNotify.mockImplementation(
        (_prefs: NotificationPreferences, _type: string, channel?: string) => {
          return channel !== "webhook";
        },
      );

      const ctx = makeTestContext();
      const result = await router.route(makeDraft(), ctx);

      expect(inApp.dispatch).toHaveBeenCalledTimes(1);
      expect(webhook.dispatch).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].channel).toBe("inApp");
    });

    it("skips all channels when shouldNotify returns false for all", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook");
      router.register(inApp);
      router.register(webhook);

      mockShouldNotify.mockReturnValue(false);

      const ctx = makeTestContext();
      const result = await router.route(makeDraft(), ctx);

      expect(inApp.dispatch).not.toHaveBeenCalled();
      expect(webhook.dispatch).not.toHaveBeenCalled();
      expect(result.anySuccess).toBe(false);
      expect(result.results).toHaveLength(0);
    });

    it("calls shouldNotify with ctx.preferences for each channel", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook");
      router.register(inApp);
      router.register(webhook);

      const draft = makeDraft({ type: "module_deactivated" });
      const ctx = makeTestContext();
      await router.route(draft, ctx);

      expect(mockShouldNotify).toHaveBeenCalledWith(ctx.preferences, "module_deactivated", "inApp");
      expect(mockShouldNotify).toHaveBeenCalledWith(ctx.preferences, "module_deactivated", "webhook");
    });
  });

  describe("channel availability via DispatchContext flags", () => {
    it("skips channel when its availability flag is false", async () => {
      const webhook = makeMockChannel("webhook");
      router.register(webhook);

      const ctx = makeTestContext({ webhookAvailable: false });
      const result = await router.route(makeDraft(), ctx);

      expect(webhook.dispatch).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(0);
      expect(result.anySuccess).toBe(false);
    });

    it("dispatches to channel when its availability flag is true", async () => {
      const webhook = makeMockChannel("webhook");
      router.register(webhook);

      const ctx = makeTestContext({ webhookAvailable: true });
      const result = await router.route(makeDraft(), ctx);

      expect(webhook.dispatch).toHaveBeenCalledTimes(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
    });

    it("skips email channel when emailAvailable is false", async () => {
      const email = makeMockChannel("email");
      router.register(email);

      const ctx = makeTestContext({ emailAvailable: false });
      await router.route(makeDraft(), ctx);

      expect(email.dispatch).not.toHaveBeenCalled();
    });

    it("skips push channel when pushAvailable is false", async () => {
      const push = makeMockChannel("push");
      router.register(push);

      const ctx = makeTestContext({ pushAvailable: false });
      await router.route(makeDraft(), ctx);

      expect(push.dispatch).not.toHaveBeenCalled();
    });

    it("does not skip inApp channel (inAppAvailable is always true)", async () => {
      const inApp = makeMockChannel("inApp");
      router.register(inApp);

      // inAppAvailable is always true on DispatchContext
      const ctx = makeTestContext();
      await router.route(makeDraft(), ctx);

      expect(inApp.dispatch).toHaveBeenCalledTimes(1);
    });

    it("allows partial availability — dispatches only to available channels", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook");
      const email = makeMockChannel("email");
      const push = makeMockChannel("push");
      router.register(inApp);
      router.register(webhook);
      router.register(email);
      router.register(push);

      const ctx = makeTestContext({
        webhookAvailable: true,
        emailAvailable: false,
        pushAvailable: false,
      });
      const result = await router.route(makeDraft(), ctx);

      expect(inApp.dispatch).toHaveBeenCalledTimes(1);
      expect(webhook.dispatch).toHaveBeenCalledTimes(1);
      expect(email.dispatch).not.toHaveBeenCalled();
      expect(push.dispatch).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(2);
    });

    it("does not check availability when shouldNotify returns false", async () => {
      const email = makeMockChannel("email");
      router.register(email);

      mockShouldNotify.mockReturnValue(false);

      const ctx = makeTestContext({ emailAvailable: true });
      await router.route(makeDraft(), ctx);

      // shouldNotify filter comes first — email never reaches availability check
      expect(email.dispatch).not.toHaveBeenCalled();
    });
  });

  describe("error isolation across channels", () => {
    it("continues dispatching when one channel throws", async () => {
      const failing = makeMockChannel("inApp", {
        dispatch: jest.fn().mockRejectedValue(new Error("DB connection lost")),
      });
      const healthy = makeMockChannel("webhook");
      router.register(failing);
      router.register(healthy);

      const ctx = makeTestContext();
      const result = await router.route(makeDraft(), ctx);

      expect(failing.dispatch).toHaveBeenCalledTimes(1);
      expect(healthy.dispatch).toHaveBeenCalledTimes(1);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({
        success: false,
        channel: "inApp",
        error: "DB connection lost",
      });
      expect(result.results[1]).toEqual({ success: true, channel: "webhook" });
    });

    it("handles non-Error thrown objects gracefully", async () => {
      const failing = makeMockChannel("inApp", {
        dispatch: jest.fn().mockRejectedValue("string-error"),
      });
      router.register(failing);

      const ctx = makeTestContext();
      const result = await router.route(makeDraft(), ctx);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        success: false,
        channel: "inApp",
        error: "Unknown error",
      });
    });
  });

  describe("no channels registered", () => {
    it("returns success with empty results when no channels exist", async () => {
      const ctx = makeTestContext();
      const result = await router.route(makeDraft(), ctx);

      expect(result.anySuccess).toBe(false);
      expect(result.results).toHaveLength(0);
    });
  });

  describe("duplicate registration prevention", () => {
    it("skips duplicate channel registration and warns", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const channel1 = makeMockChannel("inApp");
      const channel2 = makeMockChannel("inApp");
      router.register(channel1);
      router.register(channel2);

      expect(router.channelCount).toBe(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[ChannelRouter] Channel "inApp" already registered, skipping',
      );

      // Only the first channel's dispatch should be called
      const ctx = makeTestContext();
      await router.route(makeDraft(), ctx);
      expect(channel1.dispatch).toHaveBeenCalledTimes(1);
      expect(channel2.dispatch).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("allows different channel names", () => {
      router.register(makeMockChannel("inApp"));
      router.register(makeMockChannel("webhook"));
      router.register(makeMockChannel("email"));

      expect(router.channelCount).toBe(3);
      expect(router.channelNames).toEqual(["inApp", "webhook", "email"]);
    });
  });

  describe("results aggregation", () => {
    it("returns anySuccess true when at least one channel succeeds", async () => {
      const failing = makeMockChannel("inApp", {
        dispatch: jest.fn<Promise<ChannelResult>, [NotificationDraft, DispatchContext]>().mockResolvedValue({
          success: false,
          channel: "inApp",
          error: "DB error",
        }),
      });
      const healthy = makeMockChannel("webhook");
      router.register(failing);
      router.register(healthy);

      const ctx = makeTestContext();
      const result = await router.route(makeDraft(), ctx);

      expect(result.anySuccess).toBe(true);
    });

    it("returns anySuccess false when all channels fail", async () => {
      const failing1 = makeMockChannel("inApp", {
        dispatch: jest.fn<Promise<ChannelResult>, [NotificationDraft, DispatchContext]>().mockResolvedValue({
          success: false,
          channel: "inApp",
          error: "DB error",
        }),
      });
      const failing2 = makeMockChannel("webhook", {
        dispatch: jest.fn<Promise<ChannelResult>, [NotificationDraft, DispatchContext]>().mockResolvedValue({
          success: false,
          channel: "webhook",
          error: "Delivery failed",
        }),
      });
      router.register(failing1);
      router.register(failing2);

      const ctx = makeTestContext();
      const result = await router.route(makeDraft(), ctx);

      expect(result.anySuccess).toBe(false);
      expect(result.results).toHaveLength(2);
    });

    it("returns anySuccess false when no channels pass gating", async () => {
      router.register(makeMockChannel("inApp"));
      mockShouldNotify.mockReturnValue(false);

      const ctx = makeTestContext();
      const result = await router.route(makeDraft(), ctx);

      expect(result.anySuccess).toBe(false);
      expect(result.results).toHaveLength(0);
    });

    it("collects results only from channels that were dispatched", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook");
      router.register(inApp);
      router.register(webhook);

      // webhook not available via DispatchContext flag
      const ctx = makeTestContext({ webhookAvailable: false });
      const result = await router.route(makeDraft(), ctx);

      // Only inApp was dispatched (webhook not available)
      expect(result.results).toHaveLength(1);
      expect(result.results[0].channel).toBe("inApp");
    });
  });

  describe("channelCount and channelNames accessors", () => {
    it("returns 0 for empty router", () => {
      expect(router.channelCount).toBe(0);
      expect(router.channelNames).toEqual([]);
    });

    it("reflects registered channels", () => {
      router.register(makeMockChannel("inApp"));
      router.register(makeMockChannel("webhook"));

      expect(router.channelCount).toBe(2);
      expect(router.channelNames).toEqual(["inApp", "webhook"]);
    });
  });

  describe("invalidateAvailability (no-op after PERF-3)", () => {
    it("invalidateAvailability is a no-op but does not throw", () => {
      expect(() => router.invalidateAvailability("user-A")).not.toThrow();
      expect(() => router.invalidateAvailability("user-A", "webhook")).not.toThrow();
      expect(() => router.invalidateAvailability()).not.toThrow();
    });

    it("invalidateAllChannels is a no-op but does not throw", () => {
      expect(() => router.invalidateAllChannels("user-A")).not.toThrow();
    });

    it("has() and clear() test-helper hooks behave as expected", () => {
      router.register(makeMockChannel("inApp"));
      router.register(makeMockChannel("webhook"));

      expect(router.has("inApp")).toBe(true);
      expect(router.has("webhook")).toBe(true);
      expect(router.has("email")).toBe(false);

      router.clear();
      expect(router.channelCount).toBe(0);
      expect(router.has("inApp")).toBe(false);
    });
  });
});
