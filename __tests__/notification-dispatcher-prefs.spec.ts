/**
 * NotificationDispatcher — Preference-aware dispatching tests
 *
 * PERF-3: resolvePreferences replaced by buildDispatchContext. The context
 * carries preferences, locale, and all channel data in a single snapshot.
 * These tests verify that preferences are correctly resolved from UserSettings
 * and that the staged buffer flush respects them.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// Mock Prisma
const mockCreate = jest.fn().mockResolvedValue({});
const mockFindUnique = jest.fn();
const mockAutomationFindFirst = jest.fn().mockResolvedValue({ name: "Test Automation" });
const mockUserFindUnique = jest.fn().mockResolvedValue({ email: "user@example.com" });
const mockSmtpConfigFindFirst = jest.fn().mockResolvedValue(null);
const mockVapidConfigFindUnique = jest.fn().mockResolvedValue(null);
const mockWebPushSubscriptionFindMany = jest.fn().mockResolvedValue([]);
const mockWebhookEndpointFindMany = jest.fn().mockResolvedValue([]);

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    notification: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
    userSettings: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    automation: {
      findFirst: (...args: unknown[]) => mockAutomationFindFirst(...args),
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

// Mock i18n dictionaries — returns template strings with placeholders
jest.mock("@/i18n/dictionaries", () => ({
  t: jest.fn((_locale: string, key: string) => {
    const translations: Record<string, string> = {
      "notifications.vacancyPromoted": "Job created from staged vacancy",
      "notifications.bulkActionCompleted": "{succeeded} items {actionType} successfully",
      "notifications.retentionCompleted": "{count} expired vacancies cleaned up",
      "notifications.moduleDeactivated": "Module {name} deactivated. {automationCount} automation(s) paused.",
      "notifications.moduleReactivated": "Module {name} reactivated. {automationCount} automation(s) remain paused.",
      "notifications.batchStaged": "{count} new vacancies staged from automation",
      "notifications.jobStatusChanged": "Job status changed to {newStatus}",
    };
    return translations[key] ?? key;
  }),
  getDictionary: jest.fn(() => ({})),
}));

import { _testHelpers } from "@/lib/events/consumers/notification-dispatcher";
import {
  registerChannels,
  _resetChannelRegistrationForTesting,
  channelRouter,
} from "@/lib/notifications/channel-router";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/models/notification.model";

describe("NotificationDispatcher buildDispatchContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns DEFAULT_NOTIFICATION_PREFERENCES when no settings exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    const ctx = await _testHelpers.buildDispatchContext("user-1");

    expect(ctx.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns DEFAULT_NOTIFICATION_PREFERENCES when settings have no notifications key", async () => {
    mockFindUnique.mockResolvedValue({
      id: "settings-1",
      userId: "user-1",
      settings: JSON.stringify({ ai: { moduleId: "ollama", model: "llama3" } }),
    });

    const ctx = await _testHelpers.buildDispatchContext("user-1");

    expect(ctx.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("returns stored notification preferences when they exist", async () => {
    const storedPrefs = {
      enabled: false,
      channels: { inApp: true, webhook: false, email: false, push: false },
      perType: { vacancy_promoted: { enabled: false } },
    };
    mockFindUnique.mockResolvedValue({
      id: "settings-1",
      userId: "user-1",
      settings: JSON.stringify({ notifications: storedPrefs }),
    });

    const ctx = await _testHelpers.buildDispatchContext("user-1");

    expect(ctx.preferences).toEqual(storedPrefs);
  });

  it("returns defaults on DB error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB connection failed"));

    const ctx = await _testHelpers.buildDispatchContext("user-1");

    expect(ctx.preferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("carries userId on the context", async () => {
    mockFindUnique.mockResolvedValue(null);

    const ctx = await _testHelpers.buildDispatchContext("user-1");

    expect(ctx.userId).toBe("user-1");
  });

  it("resolves locale from UserSettings display.locale", async () => {
    mockFindUnique.mockResolvedValue({
      id: "settings-1",
      userId: "user-1",
      settings: JSON.stringify({
        display: { locale: "de" },
        notifications: DEFAULT_NOTIFICATION_PREFERENCES,
      }),
    });

    const ctx = await _testHelpers.buildDispatchContext("user-1");

    expect(ctx.locale).toBe("de");
  });
});

describe("NotificationDispatcher flushStagedBuffer with preferences", () => {
  beforeAll(() => {
    // Sprint 3 M-A-05: channel registration is no longer a side effect of
    // importing notification-dispatcher.ts — it must be triggered explicitly.
    channelRouter.clear();
    _resetChannelRegistrationForTesting();
    registerChannels();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    _testHelpers.stagedBuffers.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a notification when preferences allow it", async () => {
    // User has default preferences (everything enabled)
    mockFindUnique.mockResolvedValue(null);

    // Simulate a staged buffer entry
    _testHelpers.stagedBuffers.set("auto-1", {
      userId: "user-1",
      count: 5,
      timer: setTimeout(() => {}, 0),
    });

    await _testHelpers.flushStagedBuffer("auto-1");

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "vacancy_batch_staged",
      }),
    });
  });

  it("skips notification when user has disabled globally", async () => {
    mockFindUnique.mockResolvedValue({
      id: "s-1",
      userId: "user-1",
      settings: JSON.stringify({
        notifications: {
          enabled: false,
          channels: { inApp: true, webhook: false, email: false, push: false },
          perType: {},
        },
      }),
    });

    _testHelpers.stagedBuffers.set("auto-2", {
      userId: "user-1",
      count: 3,
      timer: setTimeout(() => {}, 0),
    });

    await _testHelpers.flushStagedBuffer("auto-2");

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("skips notification when specific type is disabled", async () => {
    mockFindUnique.mockResolvedValue({
      id: "s-1",
      userId: "user-1",
      settings: JSON.stringify({
        notifications: {
          enabled: true,
          channels: { inApp: true, webhook: false, email: false, push: false },
          perType: { vacancy_batch_staged: { enabled: false } },
        },
      }),
    });

    _testHelpers.stagedBuffers.set("auto-3", {
      userId: "user-1",
      count: 2,
      timer: setTimeout(() => {}, 0),
    });

    await _testHelpers.flushStagedBuffer("auto-3");

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
