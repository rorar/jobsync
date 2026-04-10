/**
 * ChannelRouter Tests
 *
 * Tests: per-channel shouldNotify gating, error isolation across channels,
 * basic routing, no channels registered, channel unavailability,
 * duplicate registration prevention, results aggregation.
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
import type { NotificationPreferences } from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-42";

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  channels: { inApp: true, webhook: true, email: false, push: false },
  perType: {},
};

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
    isAvailable: jest.Mock;
  }> = {},
): NotificationChannel & { dispatch: jest.Mock; isAvailable: jest.Mock } {
  return {
    name,
    dispatch:
      overrides.dispatch ??
      jest.fn<Promise<ChannelResult>, [NotificationDraft, string]>().mockResolvedValue({
        success: true,
        channel: name,
      }),
    isAvailable:
      overrides.isAvailable ??
      jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
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
    it("routes a draft to all registered channels that pass shouldNotify + isAvailable", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook");
      router.register(inApp);
      router.register(webhook);

      const draft = makeDraft();
      const result = await router.route(draft, DEFAULT_PREFS);

      expect(inApp.dispatch).toHaveBeenCalledWith(draft, TEST_USER_ID);
      expect(webhook.dispatch).toHaveBeenCalledWith(draft, TEST_USER_ID);
      expect(result.anySuccess).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({ success: true, channel: "inApp" });
      expect(result.results[1]).toEqual({ success: true, channel: "webhook" });
    });

    it("passes userId from draft to isAvailable", async () => {
      const channel = makeMockChannel("inApp");
      router.register(channel);

      await router.route(makeDraft(), DEFAULT_PREFS);

      expect(channel.isAvailable).toHaveBeenCalledWith(TEST_USER_ID);
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

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

      expect(inApp.dispatch).toHaveBeenCalledTimes(1);
      expect(webhook.dispatch).not.toHaveBeenCalled();
      expect(webhook.isAvailable).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].channel).toBe("inApp");
    });

    it("skips all channels when shouldNotify returns false for all", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook");
      router.register(inApp);
      router.register(webhook);

      mockShouldNotify.mockReturnValue(false);

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

      expect(inApp.dispatch).not.toHaveBeenCalled();
      expect(webhook.dispatch).not.toHaveBeenCalled();
      expect(result.anySuccess).toBe(false);
      expect(result.results).toHaveLength(0);
    });

    it("calls shouldNotify with correct arguments for each channel", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook");
      router.register(inApp);
      router.register(webhook);

      const draft = makeDraft({ type: "module_deactivated" });
      const prefs = { ...DEFAULT_PREFS };
      await router.route(draft, prefs);

      expect(mockShouldNotify).toHaveBeenCalledWith(prefs, "module_deactivated", "inApp");
      expect(mockShouldNotify).toHaveBeenCalledWith(prefs, "module_deactivated", "webhook");
    });
  });

  describe("channel availability", () => {
    it("skips channel when isAvailable returns false", async () => {
      const channel = makeMockChannel("webhook", {
        isAvailable: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false),
      });
      router.register(channel);

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

      expect(channel.isAvailable).toHaveBeenCalledWith(TEST_USER_ID);
      expect(channel.dispatch).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(0);
      expect(result.anySuccess).toBe(false);
    });

    it("does not check isAvailable when shouldNotify returns false", async () => {
      const channel = makeMockChannel("inApp");
      router.register(channel);

      mockShouldNotify.mockReturnValue(false);

      await router.route(makeDraft(), DEFAULT_PREFS);

      expect(channel.isAvailable).not.toHaveBeenCalled();
      expect(channel.dispatch).not.toHaveBeenCalled();
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

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

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

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        success: false,
        channel: "inApp",
        error: "Unknown error",
      });
    });

    it("handles isAvailable throwing without blocking other channels", async () => {
      const failing = makeMockChannel("inApp", {
        isAvailable: jest.fn().mockRejectedValue(new Error("Infra check failed")),
      });
      const healthy = makeMockChannel("webhook");
      router.register(failing);
      router.register(healthy);

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

      expect(healthy.dispatch).toHaveBeenCalledTimes(1);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({
        success: false,
        channel: "inApp",
        error: "Infra check failed",
      });
      expect(result.results[1]).toEqual({ success: true, channel: "webhook" });
    });
  });

  describe("no channels registered", () => {
    it("returns success with empty results when no channels exist", async () => {
      const result = await router.route(makeDraft(), DEFAULT_PREFS);

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
      await router.route(makeDraft(), DEFAULT_PREFS);
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
        dispatch: jest.fn<Promise<ChannelResult>, [NotificationDraft, string]>().mockResolvedValue({
          success: false,
          channel: "inApp",
          error: "DB error",
        }),
      });
      const healthy = makeMockChannel("webhook");
      router.register(failing);
      router.register(healthy);

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

      expect(result.anySuccess).toBe(true);
    });

    it("returns anySuccess false when all channels fail", async () => {
      const failing1 = makeMockChannel("inApp", {
        dispatch: jest.fn<Promise<ChannelResult>, [NotificationDraft, string]>().mockResolvedValue({
          success: false,
          channel: "inApp",
          error: "DB error",
        }),
      });
      const failing2 = makeMockChannel("webhook", {
        dispatch: jest.fn<Promise<ChannelResult>, [NotificationDraft, string]>().mockResolvedValue({
          success: false,
          channel: "webhook",
          error: "Delivery failed",
        }),
      });
      router.register(failing1);
      router.register(failing2);

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

      expect(result.anySuccess).toBe(false);
      expect(result.results).toHaveLength(2);
    });

    it("returns anySuccess false when no channels pass gating", async () => {
      router.register(makeMockChannel("inApp"));
      mockShouldNotify.mockReturnValue(false);

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

      expect(result.anySuccess).toBe(false);
      expect(result.results).toHaveLength(0);
    });

    it("collects results only from channels that were dispatched", async () => {
      const inApp = makeMockChannel("inApp");
      const webhook = makeMockChannel("webhook", {
        isAvailable: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false),
      });
      router.register(inApp);
      router.register(webhook);

      const result = await router.route(makeDraft(), DEFAULT_PREFS);

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

  // ---------------------------------------------------------------------------
  // Sprint 3 M-P-01 + M-P-SPEC-02 — isAvailable cache
  //
  // The router must cache channel availability per (userId, channelName) with
  // a short TTL so repeated dispatches within the cache window skip the
  // per-channel DB round-trip. The cache lives on the router instance (not
  // a free global) so a fresh `new ChannelRouter()` always starts cold.
  // ---------------------------------------------------------------------------
  describe("isAvailable cache (M-P-01 + M-P-SPEC-02)", () => {
    it("caches isAvailable result across dispatches within the TTL window", async () => {
      // Short TTL (1s) so the test does not have to wait 30 seconds.
      const cachedRouter = new ChannelRouter({ availabilityTtlMs: 1_000 });
      const channel = makeMockChannel("webhook");
      cachedRouter.register(channel);

      await cachedRouter.route(makeDraft(), DEFAULT_PREFS);
      await cachedRouter.route(makeDraft(), DEFAULT_PREFS);
      await cachedRouter.route(makeDraft(), DEFAULT_PREFS);

      // isAvailable called exactly ONCE across 3 dispatches for the same user.
      expect(channel.isAvailable).toHaveBeenCalledTimes(1);
      expect(channel.dispatch).toHaveBeenCalledTimes(3);
    });

    it("does not cache across distinct users", async () => {
      const cachedRouter = new ChannelRouter({ availabilityTtlMs: 1_000 });
      const channel = makeMockChannel("webhook");
      cachedRouter.register(channel);

      await cachedRouter.route(makeDraft({ userId: "user-A" }), DEFAULT_PREFS);
      await cachedRouter.route(makeDraft({ userId: "user-B" }), DEFAULT_PREFS);

      // Two distinct users — two isAvailable calls.
      expect(channel.isAvailable).toHaveBeenCalledTimes(2);
      expect(channel.isAvailable).toHaveBeenNthCalledWith(1, "user-A");
      expect(channel.isAvailable).toHaveBeenNthCalledWith(2, "user-B");
    });

    it("does not cache across distinct channels", async () => {
      const cachedRouter = new ChannelRouter({ availabilityTtlMs: 1_000 });
      const webhook = makeMockChannel("webhook");
      const email = makeMockChannel("email");
      cachedRouter.register(webhook);
      cachedRouter.register(email);

      // Need to allow email via prefs too for this test.
      const prefs: NotificationPreferences = {
        enabled: true,
        channels: { inApp: true, webhook: true, email: true, push: false },
        perType: {},
      };
      await cachedRouter.route(makeDraft(), prefs);

      // Both channels see exactly one isAvailable call (not shared).
      expect(webhook.isAvailable).toHaveBeenCalledTimes(1);
      expect(email.isAvailable).toHaveBeenCalledTimes(1);
    });

    it("re-queries after the TTL expires", async () => {
      jest.useFakeTimers();
      const cachedRouter = new ChannelRouter({ availabilityTtlMs: 1_000 });
      const channel = makeMockChannel("webhook");
      cachedRouter.register(channel);

      await cachedRouter.route(makeDraft(), DEFAULT_PREFS);
      expect(channel.isAvailable).toHaveBeenCalledTimes(1);

      // Advance the monotonic clock beyond the TTL. Because the cache uses
      // Date.now(), we fake the system clock forward.
      jest.setSystemTime(Date.now() + 2_000);

      await cachedRouter.route(makeDraft(), DEFAULT_PREFS);
      expect(channel.isAvailable).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it("invalidateAvailability(userId) drops the cache entry for that user only", async () => {
      const cachedRouter = new ChannelRouter({ availabilityTtlMs: 10_000 });
      const channel = makeMockChannel("webhook");
      cachedRouter.register(channel);

      await cachedRouter.route(makeDraft({ userId: "user-A" }), DEFAULT_PREFS);
      await cachedRouter.route(makeDraft({ userId: "user-B" }), DEFAULT_PREFS);
      expect(channel.isAvailable).toHaveBeenCalledTimes(2);

      // Invalidate only user-A; user-B remains cached.
      cachedRouter.invalidateAvailability("user-A");

      await cachedRouter.route(makeDraft({ userId: "user-A" }), DEFAULT_PREFS);
      await cachedRouter.route(makeDraft({ userId: "user-B" }), DEFAULT_PREFS);

      expect(channel.isAvailable).toHaveBeenCalledTimes(3);
      expect(channel.isAvailable).toHaveBeenNthCalledWith(3, "user-A");
    });

    it("invalidateAvailability() with no args drops the whole cache", async () => {
      const cachedRouter = new ChannelRouter({ availabilityTtlMs: 10_000 });
      const channel = makeMockChannel("webhook");
      cachedRouter.register(channel);

      await cachedRouter.route(makeDraft({ userId: "user-A" }), DEFAULT_PREFS);
      await cachedRouter.route(makeDraft({ userId: "user-B" }), DEFAULT_PREFS);
      expect(channel.isAvailable).toHaveBeenCalledTimes(2);

      cachedRouter.invalidateAvailability();

      await cachedRouter.route(makeDraft({ userId: "user-A" }), DEFAULT_PREFS);
      await cachedRouter.route(makeDraft({ userId: "user-B" }), DEFAULT_PREFS);

      expect(channel.isAvailable).toHaveBeenCalledTimes(4);
    });

    it("invalidateAvailability(userId, channelName) drops a single slot", async () => {
      const cachedRouter = new ChannelRouter({ availabilityTtlMs: 10_000 });
      const webhook = makeMockChannel("webhook");
      const email = makeMockChannel("email");
      cachedRouter.register(webhook);
      cachedRouter.register(email);

      const prefs: NotificationPreferences = {
        enabled: true,
        channels: { inApp: true, webhook: true, email: true, push: false },
        perType: {},
      };
      await cachedRouter.route(makeDraft(), prefs);
      expect(webhook.isAvailable).toHaveBeenCalledTimes(1);
      expect(email.isAvailable).toHaveBeenCalledTimes(1);

      // Invalidate only the webhook slot for this user.
      cachedRouter.invalidateAvailability(TEST_USER_ID, "webhook");

      await cachedRouter.route(makeDraft(), prefs);
      expect(webhook.isAvailable).toHaveBeenCalledTimes(2);
      // email cache still intact.
      expect(email.isAvailable).toHaveBeenCalledTimes(1);
    });

    it("does not cache thrown errors (retries on next dispatch)", async () => {
      const cachedRouter = new ChannelRouter({ availabilityTtlMs: 10_000 });
      const isAvailable = jest
        .fn<Promise<boolean>, [string]>()
        .mockRejectedValueOnce(new Error("transient DB blip"))
        .mockResolvedValueOnce(true);
      const channel = makeMockChannel("webhook", { isAvailable });
      cachedRouter.register(channel);

      // First call: rejects (no cache written). The router catches it via
      // Promise.allSettled and surfaces an error ChannelResult.
      const first = await cachedRouter.route(makeDraft(), DEFAULT_PREFS);
      expect(first.results[0].success).toBe(false);

      // Second call: retries (cache was NOT populated with false on reject).
      const second = await cachedRouter.route(makeDraft(), DEFAULT_PREFS);
      expect(channel.isAvailable).toHaveBeenCalledTimes(2);
      expect(channel.dispatch).toHaveBeenCalledTimes(1);
      expect(second.results[0].success).toBe(true);
    });

    it("has() and clear() test-helper hooks behave as expected", () => {
      const cachedRouter = new ChannelRouter();
      cachedRouter.register(makeMockChannel("inApp"));
      cachedRouter.register(makeMockChannel("webhook"));

      expect(cachedRouter.has("inApp")).toBe(true);
      expect(cachedRouter.has("webhook")).toBe(true);
      expect(cachedRouter.has("email")).toBe(false);

      cachedRouter.clear();
      expect(cachedRouter.channelCount).toBe(0);
      expect(cachedRouter.has("inApp")).toBe(false);
    });
  });
});
