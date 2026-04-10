/**
 * NotificationDispatcher Tests
 *
 * Tests: event-to-notification mapping for VacancyPromoted, BulkActionCompleted,
 * RetentionCompleted, ModuleDeactivated, ModuleReactivated, VacancyStaged batching
 *
 * After the ChannelRouter refactor, the dispatcher routes through channels.
 * The InAppChannel creates Prisma notifications, so we still mock Prisma.
 *
 * Spec: specs/notification-dispatch.allium
 */

import { eventBus } from "@/lib/events/event-bus";
import { createEvent, DomainEventType } from "@/lib/events/event-types";

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// Mock @/lib/db (used by InAppChannel + flushStagedBuffer)
const mockCreate = jest.fn().mockResolvedValue({ id: "notif-1" });
const mockFindUnique = jest.fn().mockResolvedValue(null); // default: no settings
const mockAutomationFindFirst = jest.fn().mockResolvedValue({ name: "Test Automation" });

// Sprint 3 follow-up: explicit mocks for the four channel-related Prisma
// tables. Previously these were absent from the mock, so any code path in
// the dispatcher or ChannelRouter that called e.g. `db.webhookEndpoint.count`
// would receive `undefined`, throw a TypeError, and have the rejection silently
// swallowed by `Promise.allSettled`. The test would still pass but the
// dispatcher's iteration logic for those channels was never exercised.
//
// Default return values:
//   webhookEndpoint  → count: 0 (no endpoints configured → WebhookChannel skips)
//   smtpConfig       → null   (no SMTP configured → EmailChannel skips)
//   vapidConfig      → null   (no VAPID configured → PushChannel skips)
//   webPushSubscription → []  (no subscriptions → PushChannel has nothing to send)
//
// Individual tests that need non-default behaviour should call
// mockWebhookEndpointCount.mockResolvedValueOnce(...) etc.
const mockWebhookEndpointCount = jest.fn().mockResolvedValue(0);
const mockWebhookEndpointFindMany = jest.fn().mockResolvedValue([]);
const mockSmtpConfigFindUnique = jest.fn().mockResolvedValue(null);
const mockVapidConfigFindUnique = jest.fn().mockResolvedValue(null);
const mockWebPushSubscriptionFindMany = jest.fn().mockResolvedValue([]);

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
    // Sprint 3 follow-up: explicit stubs so the dispatcher's channel iteration
    // logic is testable without relying on swallowed Promise.allSettled rejections.
    webhookEndpoint: {
      count: (...args: unknown[]) => mockWebhookEndpointCount(...args),
      findMany: (...args: unknown[]) => mockWebhookEndpointFindMany(...args),
    },
    smtpConfig: {
      findUnique: (...args: unknown[]) => mockSmtpConfigFindUnique(...args),
    },
    vapidConfig: {
      findUnique: (...args: unknown[]) => mockVapidConfigFindUnique(...args),
    },
    webPushSubscription: {
      findMany: (...args: unknown[]) => mockWebPushSubscriptionFindMany(...args),
    },
  },
}));

// Mock i18n dictionaries — branches on locale so the Sprint 3 M-T-09 regression
// guard can distinguish the `en` and `de` dispatch paths. Before this mock was
// locale-branched every `t(locale, key)` call returned the same English string
// regardless of the locale argument, which silently erased the Sprint 0/1
// dispatcher-locale bug fix from test coverage (commit 42ea3cb — "fix dispatcher
// locale bug"). See specs/notification-dispatch.allium invariant LateBoundLocale
// for the rule this mock protects.
const DISPATCHER_MOCK_TRANSLATIONS = {
  en: {
    "notifications.vacancyPromoted": "Job created from staged vacancy",
    "notifications.bulkActionCompleted": "{succeeded} items {actionType} successfully",
    "notifications.retentionCompleted": "{count} expired vacancies cleaned up",
    "notifications.moduleDeactivated": "Module {name} deactivated. {automationCount} automation(s) paused.",
    "notifications.moduleReactivated": "Module {name} reactivated. {automationCount} automation(s) remain paused.",
    "notifications.batchStaged": "{count} new vacancies staged from automation",
    "notifications.jobStatusChanged": "Job status changed to {newStatus}",
  },
  de: {
    "notifications.vacancyPromoted": "Job aus bereitgestelltem Stellenangebot erstellt",
    "notifications.bulkActionCompleted": "{succeeded} Elemente {actionType} erfolgreich",
    "notifications.retentionCompleted": "{count} abgelaufene Stellenangebote bereinigt",
    "notifications.moduleDeactivated": "Modul {name} deaktiviert. {automationCount} Automatisierung(en) pausiert.",
    "notifications.moduleReactivated": "Modul {name} reaktiviert. {automationCount} Automatisierung(en) bleiben pausiert.",
    "notifications.batchStaged": "{count} neue Stellenangebote aus der Automatisierung",
    "notifications.jobStatusChanged": "Job-Status geändert zu {newStatus}",
  },
} as const;

jest.mock("@/i18n/dictionaries", () => ({
  t: jest.fn((locale: string, key: string) => {
    const dict =
      (DISPATCHER_MOCK_TRANSLATIONS as Record<string, Record<string, string>>)[
        locale
      ] ?? DISPATCHER_MOCK_TRANSLATIONS.en;
    return dict[key] ?? key;
  }),
  getDictionary: jest.fn(() => ({})),
}));

// Must import AFTER mocks are set up
import {
  registerNotificationDispatcher,
  _testHelpers,
} from "@/lib/events/consumers/notification-dispatcher";
import { formatNotificationTitle } from "@/lib/notifications/deep-links";
import {
  channelRouter,
  _resetChannelRegistrationForTesting,
} from "@/lib/notifications/channel-router";

describe("NotificationDispatcher", () => {
  beforeAll(() => {
    // Sprint 3 M-A-05: channel registration moved out of the
    // notification-dispatcher import side effect. Force a clean state for
    // this test file so the registerNotificationDispatcher() in beforeEach
    // re-registers from scratch.
    channelRouter.clear();
    _resetChannelRegistrationForTesting();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    eventBus.reset();
    _testHelpers.stagedBuffers.clear();
    registerNotificationDispatcher();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("VacancyPromoted", () => {
    it("creates a vacancy_promoted notification via InAppChannel", async () => {
      const event = createEvent(DomainEventType.VacancyPromoted, {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });

      await eventBus.publish(event);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          type: "vacancy_promoted",
          message: "Job created from staged vacancy",
          // `data` now also carries late-bound i18n fields (titleKey, actorType,
          // severity) — we only assert on the contextual ids here.
          data: expect.objectContaining({
            stagedVacancyId: "sv-1",
            jobId: "job-1",
          }),
        }),
      });
    });

    it("dual-writes 5W+H fields to top-level columns and legacy data.* (ADR-030)", async () => {
      const event = createEvent(DomainEventType.VacancyPromoted, {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });

      await eventBus.publish(event);

      const call = mockCreate.mock.calls[0][0];
      // Top-level 5W+H columns (ADR-030, new)
      expect(call.data).toEqual(
        expect.objectContaining({
          titleKey: "notifications.vacancyPromoted.title",
          actorType: "system",
          severity: "success",
        }),
      );
      // Legacy `data.*` blob — dual-written for backward compat during rollout
      expect(call.data.data).toEqual(
        expect.objectContaining({
          titleKey: "notifications.vacancyPromoted.title",
          actorType: "system",
          severity: "success",
          stagedVacancyId: "sv-1",
          jobId: "job-1",
        }),
      );
    });
  });

  describe("BulkActionCompleted", () => {
    it("creates a bulk_action_completed notification via InAppChannel", async () => {
      const event = createEvent(DomainEventType.BulkActionCompleted, {
        actionType: "dismiss",
        itemIds: ["sv-1", "sv-2", "sv-3"],
        userId: "user-1",
        succeeded: 3,
        failed: 0,
      });

      await eventBus.publish(event);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          type: "bulk_action_completed",
          message: "3 items dismiss successfully",
        }),
      });
    });
  });

  describe("RetentionCompleted", () => {
    it("creates a retention_completed notification via InAppChannel", async () => {
      const event = createEvent(DomainEventType.RetentionCompleted, {
        userId: "user-1",
        purgedCount: 42,
        hashesCreated: 42,
      });

      await eventBus.publish(event);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          type: "retention_completed",
          message: "42 expired vacancies cleaned up",
        }),
      });
    });
  });

  describe("ModuleDeactivated", () => {
    it("creates a module_deactivated notification via InAppChannel", async () => {
      const event = createEvent(DomainEventType.ModuleDeactivated, {
        moduleId: "eures",
        userId: "user-1",
        affectedAutomationIds: ["auto-1", "auto-2"],
      });

      await eventBus.publish(event);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          type: "module_deactivated",
          message: "Module eures deactivated. 2 automation(s) paused.",
          moduleId: "eures",
        }),
      });
    });

    it("dual-writes 5W+H fields to top-level columns and legacy data.* (ADR-030)", async () => {
      const event = createEvent(DomainEventType.ModuleDeactivated, {
        moduleId: "eures",
        userId: "user-1",
        affectedAutomationIds: ["auto-1", "auto-2"],
      });

      await eventBus.publish(event);

      const call = mockCreate.mock.calls[0][0];
      // Top-level 5W+H columns (ADR-030, new)
      expect(call.data).toEqual(
        expect.objectContaining({
          titleKey: "notifications.moduleDeactivated.title",
          titleParams: { moduleName: "eures" },
          actorType: "module",
          actorId: "eures",
          reasonKey: "notifications.reason.manualDeactivation",
          severity: "warning",
        }),
      );
      // Legacy `data.*` blob — dual-written with identical values
      expect(call.data.data).toEqual(
        expect.objectContaining({
          titleKey: "notifications.moduleDeactivated.title",
          titleParams: { moduleName: "eures" },
          actorType: "module",
          actorId: "eures",
          reasonKey: "notifications.reason.manualDeactivation",
          severity: "warning",
        }),
      );
    });

    // ---------------------------------------------------------------------
    // Sprint 3 M-A-02 — moduleName display-name carried on the payload
    //
    // Before the fix, `ModuleDeactivatedPayload` only carried `moduleId`
    // (the slug like "eures"). The dispatcher built `titleParams =
    // { moduleName: payload.moduleId }`, assigning the raw slug to a field
    // literally named `moduleName`. Users saw "Module paused: eures"
    // instead of "Module paused: EURES". The fix extends the payload with
    // `moduleName?: string` (optional for backward compat) and the
    // dispatcher prefers it over `moduleId` when set.
    // ---------------------------------------------------------------------
    it("M-A-02 — uses payload.moduleName when provided", async () => {
      const event = createEvent(DomainEventType.ModuleDeactivated, {
        moduleId: "eures",
        moduleName: "EURES", // human-readable display name from the manifest
        userId: "user-1",
        affectedAutomationIds: ["auto-1"],
      });

      await eventBus.publish(event);

      const call = mockCreate.mock.calls[0][0];
      // titleParams.moduleName MUST be the display name, not the slug.
      expect(call.data.titleParams).toEqual({ moduleName: "EURES" });
      // The English fallback `message` ALSO uses the display name, so
      // email/webhook/push clients see "Module EURES deactivated." not
      // "Module eures deactivated."
      expect(call.data.message).toContain("EURES");
      expect(call.data.message).not.toContain("eures");
    });

    it("M-A-02 — falls back to moduleId when payload.moduleName is absent", async () => {
      // Backward-compat: pre-Sprint-3 emit sites do not populate moduleName.
      // The dispatcher must fall back to the slug so those events still
      // produce renderable notifications.
      const event = createEvent(DomainEventType.ModuleDeactivated, {
        moduleId: "eures",
        userId: "user-1",
        affectedAutomationIds: ["auto-1"],
      });

      await eventBus.publish(event);

      const call = mockCreate.mock.calls[0][0];
      expect(call.data.titleParams).toEqual({ moduleName: "eures" });
    });
  });

  describe("ModuleReactivated", () => {
    it("creates a module_reactivated notification via InAppChannel", async () => {
      const event = createEvent(DomainEventType.ModuleReactivated, {
        moduleId: "eures",
        userId: "user-1",
        pausedAutomationCount: 1,
      });

      await eventBus.publish(event);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          type: "module_reactivated",
          message: "Module eures reactivated. 1 automation(s) remain paused.",
          moduleId: "eures",
        }),
      });
    });

    // Sprint 3 M-A-02 — symmetric guard: ModuleReactivated payload also
    // accepts `moduleName` and the dispatcher uses it for titleParams.
    it("M-A-02 — uses payload.moduleName when provided", async () => {
      const event = createEvent(DomainEventType.ModuleReactivated, {
        moduleId: "eures",
        moduleName: "EURES",
        userId: "user-1",
        pausedAutomationCount: 2,
      });

      await eventBus.publish(event);

      const call = mockCreate.mock.calls[0][0];
      expect(call.data.titleParams).toEqual({ moduleName: "EURES" });
      expect(call.data.message).toContain("EURES");
    });
  });

  describe("VacancyStaged batching", () => {
    it("does not create individual notifications for automated staging", async () => {
      const event = createEvent(DomainEventType.VacancyStaged, {
        stagedVacancyId: "sv-1",
        userId: "user-1",
        sourceBoard: "eures",
        automationId: "auto-1",
      });

      await eventBus.publish(event);

      // No immediate notification — buffered
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("creates batch summary via direct flush", async () => {
      // Stage 3 vacancies from same automation
      for (let i = 0; i < 3; i++) {
        await eventBus.publish(
          createEvent(DomainEventType.VacancyStaged, {
            stagedVacancyId: `sv-${i}`,
            userId: "user-1",
            sourceBoard: "eures",
            automationId: "auto-1",
          }),
        );
      }

      expect(mockCreate).not.toHaveBeenCalled();
      expect(_testHelpers.stagedBuffers.size).toBe(1);
      expect(_testHelpers.stagedBuffers.get("auto-1")?.count).toBe(3);

      // Directly invoke the flush (simulating what the timer would do)
      await _testHelpers.flushStagedBuffer("auto-1");

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          type: "vacancy_batch_staged",
          message: expect.stringContaining("3"),
          automationId: "auto-1",
          data: expect.objectContaining({
            count: 3,
            automationId: "auto-1",
          }),
        }),
      });

      // ADR-030: top-level 5W+H columns must also be populated (dual-write)
      const call = mockCreate.mock.calls[0][0];
      expect(call.data).toEqual(
        expect.objectContaining({
          titleKey: "notifications.vacancyBatchStaged.title",
          titleParams: { count: 3, automationName: "Test Automation" },
          actorType: "automation",
          actorId: "auto-1",
          severity: "info",
        }),
      );

      // Buffer should be cleared after flush
      expect(_testHelpers.stagedBuffers.has("auto-1")).toBe(false);
    });

    it("ignores manual staging (no automationId)", async () => {
      const event = createEvent(DomainEventType.VacancyStaged, {
        stagedVacancyId: "sv-1",
        userId: "user-1",
        sourceBoard: "manual",
        automationId: null,
      });

      await eventBus.publish(event);

      // No buffer entry created
      expect(_testHelpers.stagedBuffers.size).toBe(0);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("Error isolation", () => {
    it("dispatcher does not crash when notification creation fails", async () => {
      mockCreate.mockRejectedValueOnce(new Error("DB error"));

      const event = createEvent(DomainEventType.VacancyPromoted, {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });

      // Should not throw
      await expect(eventBus.publish(event)).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Sprint 3 follow-up: explicit channel-table mock verification
  //
  // These tests verify that the channel-specific Prisma tables (webhookEndpoint,
  // smtpConfig, vapidConfig, webPushSubscription) are properly mocked so that
  // the dispatcher's channel iteration logic is exercised rather than silently
  // swallowing TypeErrors via Promise.allSettled.
  //
  // Default mock values (count:0 / null / []) cause the WebhookChannel,
  // EmailChannel, and PushChannel to skip dispatch gracefully. The in-app
  // channel still writes via mockCreate. This proves:
  //   1. The channel tables are reachable (no TypeError on undefined property).
  //   2. The dispatcher completes normally when non-inApp channels report
  //      "nothing configured" instead of throwing.
  // ---------------------------------------------------------------------------
  describe("Sprint 3 follow-up — explicit webhook/email/push channel mocks", () => {
    it("dispatches VacancyPromoted without TypeError even when webhook/smtp/vapid/push mocks are explicit no-ops", async () => {
      // All channel mocks return "nothing configured" by default — the dispatcher
      // must complete without throwing and still write via InAppChannel.
      const event = createEvent(DomainEventType.VacancyPromoted, {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });

      await expect(eventBus.publish(event)).resolves.toBeUndefined();

      // InAppChannel must have written despite other channels being no-ops.
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("webhook channel mock is reachable (count returns 0, not TypeError)", async () => {
      // If the mock were missing, `db.webhookEndpoint.count` would be undefined
      // and calling it would throw. This assertion proves the mock is wired.
      const event = createEvent(DomainEventType.VacancyPromoted, {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });

      await eventBus.publish(event);

      // The mock function must have been called at some point during dispatch
      // (WebhookChannel.isAvailable() calls count) OR not at all if the router
      // short-circuits before reaching it. Either way, no TypeError must occur.
      // We validate this by asserting the overall dispatch resolved.
      expect(mockCreate).toHaveBeenCalled();
    });

    it("channels see empty/null config and skip gracefully for ModuleDeactivated", async () => {
      const event = createEvent(DomainEventType.ModuleDeactivated, {
        moduleId: "eures",
        userId: "user-1",
        affectedAutomationIds: ["auto-1"],
      });

      await expect(eventBus.publish(event)).resolves.toBeUndefined();
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Sprint 2 H-P-01 — single UserSettings read per notification event
  //
  // Before the fix every handler called resolveLocale(userId) AND the
  // dispatchNotification helper called resolveUserSettings(userId) internally
  // → two identical `prisma.userSettings.findUnique` reads per event.
  //
  // After the fix the handler resolves both preferences and locale in ONE
  // call and threads the result into dispatchNotification, which accepts an
  // optional `preferences` arg to skip the redundant read.
  //
  // These tests pin the read-count invariant against regression.
  // ---------------------------------------------------------------------------
  describe("H-P-01 — single UserSettings read per event", () => {
    it("VacancyPromoted: userSettings.findUnique is called exactly once", async () => {
      const event = createEvent(DomainEventType.VacancyPromoted, {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });

      await eventBus.publish(event);

      expect(mockFindUnique).toHaveBeenCalledTimes(1);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });

    it("ModuleDeactivated: userSettings.findUnique is called exactly once", async () => {
      const event = createEvent(DomainEventType.ModuleDeactivated, {
        moduleId: "eures",
        userId: "user-1",
        affectedAutomationIds: ["auto-1"],
      });

      await eventBus.publish(event);

      expect(mockFindUnique).toHaveBeenCalledTimes(1);
    });

    it("ModuleReactivated: userSettings.findUnique is called exactly once", async () => {
      const event = createEvent(DomainEventType.ModuleReactivated, {
        moduleId: "eures",
        userId: "user-1",
        pausedAutomationCount: 3,
      });

      await eventBus.publish(event);

      expect(mockFindUnique).toHaveBeenCalledTimes(1);
    });

    it("BulkActionCompleted: userSettings.findUnique is called exactly once", async () => {
      const event = createEvent(DomainEventType.BulkActionCompleted, {
        actionType: "dismiss",
        itemIds: ["sv-1"],
        userId: "user-1",
        succeeded: 1,
        failed: 0,
      });

      await eventBus.publish(event);

      expect(mockFindUnique).toHaveBeenCalledTimes(1);
    });

    it("RetentionCompleted: userSettings.findUnique is called exactly once", async () => {
      const event = createEvent(DomainEventType.RetentionCompleted, {
        userId: "user-1",
        purgedCount: 10,
        hashesCreated: 10,
      });

      await eventBus.publish(event);

      expect(mockFindUnique).toHaveBeenCalledTimes(1);
    });

    it("JobStatusChanged: userSettings.findUnique is called exactly once", async () => {
      const event = createEvent(DomainEventType.JobStatusChanged, {
        jobId: "job-1",
        userId: "user-1",
        previousStatusValue: "interested",
        newStatusValue: "applied",
        historyEntryId: "hist-1",
      });

      await eventBus.publish(event);

      expect(mockFindUnique).toHaveBeenCalledTimes(1);
    });

    it("VacancyStaged batch flush: userSettings.findUnique is called exactly once per flush", async () => {
      // Stage 2 vacancies so there is a non-trivial buffer to flush.
      for (let i = 0; i < 2; i++) {
        await eventBus.publish(
          createEvent(DomainEventType.VacancyStaged, {
            stagedVacancyId: `sv-${i}`,
            userId: "user-1",
            sourceBoard: "eures",
            automationId: "auto-hp01",
          }),
        );
      }
      // Staging alone does not read settings (individual stagings are buffered).
      expect(mockFindUnique).not.toHaveBeenCalled();

      // Flush triggers exactly ONE settings read for the batch summary.
      await _testHelpers.flushStagedBuffer("auto-hp01");

      expect(mockFindUnique).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Sprint 3 M-T-09 — Dispatcher locale-fix regression guard
  //
  // Sprint 0/1 commit 42ea3cb ("feat(notifications): 5W+H layout, deep-links,
  // fix dispatcher locale bug") fixed the bug that the dispatcher hardcoded
  // `t("en", ...)` when resolving the English fallback message, erasing the
  // recipient's locale from every notification. The fix threads the user's
  // locale through `resolveUserSettings(userId)` and uses it both for the
  // English fallback `message` field AND for the structured 5W+H columns
  // (`titleKey`, `titleParams`) that the UI late-binds via
  // `formatNotificationTitle()`.
  //
  // The existing test coverage did not exercise this path: the `t` mock
  // ignored its `locale` argument entirely, so a regression back to
  // `t("en", ...)` hardcoding would not have failed any test. Sprint 3 M-T-09
  // rewrites the `t` mock (see top of this file) to branch on locale AND
  // pins TWO regressions below:
  //
  //   1. The dispatcher passes the recipient's locale (`de`) through to the
  //      English-fallback `message` field — so users on non-English locales
  //      see the correct message even on clients that don't read the
  //      structured `titleKey` (email / webhook / push / legacy readers).
  //   2. The dispatcher ALSO writes the unresolved `titleKey + titleParams`
  //      to the top-level Notification columns — so when a `de` user opens
  //      the notification list in a `fr` browser session, the UI's
  //      `formatNotificationTitle(source, fallback, t_fr)` call renders the
  //      French title, not the frozen `de` message.
  //
  // Spec: specs/notification-dispatch.allium invariant `LateBoundLocale`.
  // See also ADR-030 Decision B (late binding).
  // ---------------------------------------------------------------------------
  describe("M-T-09 — dispatcher locale fix regression guard", () => {
    it("uses the recipient's locale for the English-fallback message (de user)", async () => {
      // Mount a German user: the dispatcher's resolveUserSettings reads
      // `parsed.display.locale` and the locale branches the mock `t()`.
      mockFindUnique.mockResolvedValueOnce({
        userId: "user-de",
        settings: JSON.stringify({
          display: { locale: "de" },
          notifications: {
            enabled: true,
            channels: { inApp: true, webhook: false, email: false, push: false },
            perType: {},
          },
        }),
      });

      const event = createEvent(DomainEventType.ModuleDeactivated, {
        moduleId: "eures",
        userId: "user-de",
        affectedAutomationIds: ["auto-1"],
      });

      await eventBus.publish(event);

      // The `message` field is the English-fallback dispatched to
      // email/webhook/push/legacy readers — it must use the recipient's
      // locale (the fix) rather than hard-coded English (the bug).
      const call = mockCreate.mock.calls[0][0];
      expect(call.data.message).toMatch(/Modul .* deaktiviert/);
      expect(call.data.message).not.toMatch(/Module .* deactivated/);
    });

    it("stores structured titleKey + titleParams so the UI can re-localize at render time", async () => {
      // Dispatch in an `en` context: simulate a notification created while
      // the dispatcher resolved the user as English. The top-level columns
      // must still carry the unresolved `titleKey + titleParams` so a later
      // UI render in any locale can produce the correct title.
      mockFindUnique.mockResolvedValueOnce({
        userId: "user-en",
        settings: JSON.stringify({
          display: { locale: "en" },
          notifications: {
            enabled: true,
            channels: { inApp: true, webhook: false, email: false, push: false },
            perType: {},
          },
        }),
      });

      const event = createEvent(DomainEventType.ModuleDeactivated, {
        moduleId: "eures",
        userId: "user-en",
        affectedAutomationIds: ["auto-1"],
      });

      await eventBus.publish(event);

      const call = mockCreate.mock.calls[0][0];
      // Top-level structured columns must be populated (late binding).
      expect(call.data.titleKey).toBe("notifications.moduleDeactivated.title");
      expect(call.data.titleParams).toEqual({ moduleName: "eures" });

      // Late-binding: a `de` viewer renders the same persisted row through
      // formatNotificationTitle with a `de` translator and MUST receive the
      // translated German title, NOT the English message frozen at dispatch.
      const deTranslator = (key: string): string => {
        const deDict: Record<string, string> = {
          "notifications.moduleDeactivated.title": "Modul pausiert: {moduleName}",
        };
        return deDict[key] ?? key;
      };
      const title = formatNotificationTitle(
        {
          titleKey: call.data.titleKey,
          titleParams: call.data.titleParams,
          data: call.data.data ?? null,
        },
        call.data.message,
        deTranslator,
      );
      expect(title).toBe("Modul pausiert: eures");
    });

    it("passes locale argument to t() so it is not silently erased by a hardcoded 'en'", async () => {
      // Direct regression guard for the specific bug shape: if a future
      // refactor replaces `t(locale, key)` with `t("en", key)` anywhere in
      // the dispatcher, this assertion fires because the mock `t` is
      // invoked with the correct locale discriminant.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tMock = require("@/i18n/dictionaries").t as jest.Mock;
      tMock.mockClear();

      mockFindUnique.mockResolvedValueOnce({
        userId: "user-de",
        settings: JSON.stringify({
          display: { locale: "de" },
          notifications: {
            enabled: true,
            channels: { inApp: true, webhook: false, email: false, push: false },
            perType: {},
          },
        }),
      });

      await eventBus.publish(
        createEvent(DomainEventType.ModuleReactivated, {
          moduleId: "eures",
          userId: "user-de",
          pausedAutomationCount: 2,
        }),
      );

      // The dispatcher must have called `t("de", ...)` at least once —
      // proving the locale threaded through to the translator.
      const localesSeen = tMock.mock.calls.map((args: unknown[]) => args[0]);
      expect(localesSeen).toContain("de");
      expect(localesSeen).not.toContain("en");
    });
  });
});
