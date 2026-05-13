/**
 * Integration test: ChannelRouter + real InAppChannel + shouldNotify.
 *
 * Verifies the PreferenceSuppression invariant from notification-dispatch.allium:
 * preference gating applies uniformly — when a notification type is disabled,
 * no channel dispatches the draft, end-to-end.
 *
 * Uses REAL ChannelRouter + REAL InAppChannel (not mocked). Only Prisma is mocked
 * (to avoid DB writes). This tests the actual wiring, not mock behavior.
 */

jest.mock("server-only", () => ({}));

jest.mock("@/lib/db", () => {
  const mockPrisma = {
    notification: {
      create: jest.fn().mockResolvedValue({ id: "notif-1" }),
    },
  };
  return { __esModule: true, default: mockPrisma };
});

import prisma from "@/lib/db";
import { ChannelRouter } from "@/lib/notifications/channel-router";
import { InAppChannel } from "@/lib/notifications/channels/in-app.channel";
import type { NotificationDraft } from "@/lib/notifications/types";
import type { DispatchContext } from "@/lib/notifications/dispatch-context";
import type { NotificationPreferences } from "@/models/notification.model";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/models/notification.model";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function makeContext(
  prefsOverride?: Partial<NotificationPreferences>,
  ctxOverride?: Record<string, unknown>,
): DispatchContext {
  const preferences: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...prefsOverride,
    channels: {
      ...DEFAULT_NOTIFICATION_PREFERENCES.channels,
      ...prefsOverride?.channels,
    },
  };
  return {
    userId: "user-1",
    preferences,
    locale: "en",
    userEmail: "user@test.com",
    smtp: null,
    vapid: null,
    pushSubscriptions: [],
    webhookEndpoints: [],
    emailAvailable: false,
    pushAvailable: false,
    webhookAvailable: false,
    inAppAvailable: true,
    vapidSubject: "mailto:noreply@jobsync.local",
    ...ctxOverride,
  } as DispatchContext;
}

const draft: NotificationDraft = {
  userId: "user-1",
  type: "auth_failure",
  message: "Test notification",
  severity: "error",
};

describe("ChannelRouter + InAppChannel integration (PreferenceSuppression invariant)", () => {
  let router: ChannelRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    router = new ChannelRouter();
    router.register(new InAppChannel());
  });

  it("delivers to InApp when preferences are default (enabled, inApp=true)", async () => {
    const ctx = makeContext();
    const result = await router.route(draft, ctx);

    expect(result.anySuccess).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({ success: true, channel: "inApp" });
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it("suppresses ALL channels when global kill switch is off (enabled=false)", async () => {
    const ctx = makeContext({ enabled: false });
    const result = await router.route(draft, ctx);

    expect(result.anySuccess).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("suppresses InApp when inApp channel is disabled in preferences", async () => {
    const ctx = makeContext({ channels: { inApp: false, webhook: false, email: false, push: false } });
    const result = await router.route(draft, ctx);

    expect(result.anySuccess).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("suppresses when perType disables the specific notification type", async () => {
    const ctx = makeContext({
      perType: { auth_failure: { enabled: false } },
    });
    const result = await router.route(draft, ctx);

    expect(result.anySuccess).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("delivers when perType disables a DIFFERENT type (not the draft type)", async () => {
    const ctx = makeContext({
      perType: { cb_escalation: { enabled: false } },
    });
    const result = await router.route(draft, ctx);

    expect(result.anySuccess).toBe(true);
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it("suppresses during quiet hours", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-13T03:00:00Z")); // 3 AM UTC — within 22:00-07:00
    try {
      const ctx = makeContext({
        quietHours: { enabled: true, start: "22:00", end: "07:00", timezone: "UTC" },
      });
      const result = await router.route(draft, ctx);

      expect(result.anySuccess).toBe(false);
      expect(result.results).toHaveLength(0);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("InAppChannel writes the correct notification fields to Prisma", async () => {
    const richDraft: NotificationDraft = {
      userId: "user-1",
      type: "auth_failure",
      message: "Module failed auth",
      moduleId: "jsearch",
      automationId: "auto-1",
      severity: "error",
      actorType: "module",
      actorId: "jsearch",
      titleKey: "notifications.authFailure.title",
    };
    const ctx = makeContext();
    await router.route(richDraft, ctx);

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "auth_failure",
        message: "Module failed auth",
        moduleId: "jsearch",
        automationId: "auto-1",
        severity: "error",
        actorType: "module",
        actorId: "jsearch",
        titleKey: "notifications.authFailure.title",
      }),
    });
  });

  describe("multi-channel suppression (A-01: spec demands ALL channels)", () => {
    let webhookDispatch: jest.Mock;
    let emailDispatch: jest.Mock;

    beforeEach(() => {
      webhookDispatch = jest.fn().mockResolvedValue({ success: true, channel: "webhook" });
      emailDispatch = jest.fn().mockResolvedValue({ success: true, channel: "email" });
      // Add mock channels alongside real InAppChannel
      router.register({ name: "webhook", dispatch: webhookDispatch } as Parameters<typeof router.register>[0]);
      router.register({ name: "email", dispatch: emailDispatch } as Parameters<typeof router.register>[0]);
    });

    it("suppresses ALL channels when global kill switch is off", async () => {
      const ctx = makeContext({ enabled: false });
      const result = await router.route(draft, ctx);

      expect(result.results).toHaveLength(0);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(webhookDispatch).not.toHaveBeenCalled();
      expect(emailDispatch).not.toHaveBeenCalled();
    });

    it("suppresses ALL channels when perType disables the notification type", async () => {
      const ctx = makeContext(
        { channels: { inApp: true, webhook: true, email: true, push: false }, perType: { auth_failure: { enabled: false } } },
        { webhookAvailable: true, emailAvailable: true, webhookEndpoints: [{ id: "ep-1" }] },
      );

      const result = await router.route(draft, ctx);

      expect(result.results).toHaveLength(0);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(webhookDispatch).not.toHaveBeenCalled();
      expect(emailDispatch).not.toHaveBeenCalled();
    });

    it("per-channel selectivity: disabling webhook still delivers to inApp (A-03)", async () => {
      const ctx = makeContext(
        { channels: { inApp: true, webhook: false, email: false, push: false } },
        { webhookAvailable: true },
      );

      const result = await router.route(draft, ctx);

      // InApp delivers, webhook suppressed by channel preference
      expect(result.anySuccess).toBe(true);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(webhookDispatch).not.toHaveBeenCalled();
    });
  });
});
