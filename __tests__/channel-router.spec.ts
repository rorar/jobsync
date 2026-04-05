/**
 * ChannelRouter Tests
 *
 * Tests: per-channel shouldNotify gating, error isolation across channels,
 * basic routing, no channels registered, channel unavailability,
 * duplicate registration prevention, results aggregation.
 *
 * Spec: specs/notification-dispatch.allium
 */

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
  channels: { inApp: true, webhook: true },
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
});
