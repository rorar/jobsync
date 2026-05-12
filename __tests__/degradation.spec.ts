// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

jest.mock("@/lib/db", () => {
  const mockPrisma = {
    moduleRegistration: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    automation: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    automationRun: {
      findMany: jest.fn(),
    },
    // Note: prisma.notification is no longer used directly by degradation.ts.
    // Notifications now route through channelRouter.route().
  };
  return { __esModule: true, default: mockPrisma };
});

jest.mock("@/lib/notifications/channel-router", () => ({
  channelRouter: { route: jest.fn().mockResolvedValue({ anySuccess: true, results: [] }) },
  registerChannels: jest.fn(),
}));

jest.mock("@/lib/notifications/dispatch-context", () => ({
  buildDispatchContext: jest.fn().mockResolvedValue({
    userId: "mock-user",
    preferences: { enabled: true, quietHoursStart: null, quietHoursEnd: null, channels: { inApp: true, email: true, push: true, webhook: true }, perType: {} },
    locale: "en",
    userEmail: null,
    smtp: null,
    vapid: null,
    pushSubscriptions: [],
    webhookEndpoints: [],
    emailAvailable: false,
    pushAvailable: false,
    webhookAvailable: false,
    inAppAvailable: true,
    vapidSubject: "mailto:noreply@jobsync.local",
  }),
}));

jest.mock("@/lib/connector/registry", () => {
  const registryMap = new Map<string, any>();
  return {
    moduleRegistry: {
      get: jest.fn((id: string) => registryMap.get(id)),
      setStatus: jest.fn(),
      updateCircuitBreaker: jest.fn((id: string, consecutiveFailures: number, cbState?: string, openSince?: Date | null) => {
        const entry = registryMap.get(id);
        if (!entry) return false;
        entry.consecutiveFailures = consecutiveFailures;
        if (cbState !== undefined) entry.circuitBreakerState = cbState;
        if (openSince !== undefined) entry.circuitBreakerOpenSince = openSince ?? undefined;
        return true;
      }),
      _testMap: registryMap,
    },
  };
});

import prisma from "@/lib/db";
import { moduleRegistry } from "@/lib/connector/registry";
import {
  handleAuthFailure,
  checkConsecutiveRunFailures,
  handleCircuitBreakerTrip,
  handleCircuitBreakerRecovery,
} from "@/lib/connector/degradation";
import { ModuleStatus, ConnectorType, CircuitBreakerState } from "@/lib/connector/manifest";
import { channelRouter } from "@/lib/notifications/channel-router";
import { buildDispatchContext } from "@/lib/notifications/dispatch-context";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRegistry = moduleRegistry as jest.Mocked<typeof moduleRegistry> & {
  _testMap: Map<string, any>;
};
const mockRoute = channelRouter.route as jest.Mock;
const mockBuildDispatchContext = buildDispatchContext as jest.Mock;

describe("Degradation Rules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoute.mockClear();
    mockBuildDispatchContext.mockClear();
    mockRegistry._testMap.clear();
    // Suppress console output in tests
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("handleAuthFailure", () => {
    it("should set module status to ERROR", async () => {
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { name: "JSearch", connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });

      await handleAuthFailure("eures", "401 Unauthorized");

      expect(mockRegistry.setStatus).toHaveBeenCalledWith("eures", ModuleStatus.ERROR);
    });

    it("should pause active automations with pauseReason 'auth_failure'", async () => {
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-a", userId: "user-a", name: "Auto A" },
        { id: "auto-b", userId: "user-b", name: "Auto B" },
        { id: "auto-c", userId: "user-c", name: "Auto C" },
      ]);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { name: "JSearch", connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });

      await handleAuthFailure("openai", "403 Forbidden");

      // TOCTOU-safe: findMany captures IDs, then updateMany targets those exact IDs
      expect(mockPrisma.automation.findMany).toHaveBeenCalledWith({
        where: { jobBoard: "openai", status: "active" },
        select: { id: true, userId: true, name: true },
      });
      expect(mockPrisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["auto-a", "auto-b", "auto-c"] } },
        data: {
          status: "paused",
          pauseReason: "auth_failure",
        },
      });
    });

    it("should return the count of paused automations", async () => {
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-1", userId: "user-1", name: "One" },
        { id: "auto-2", userId: "user-2", name: "Two" },
        { id: "auto-3", userId: "user-3", name: "Three" },
        { id: "auto-4", userId: "user-4", name: "Four" },
        { id: "auto-5", userId: "user-5", name: "Five" },
      ]);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 5 });
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { name: "JSearch", connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });

      const result = await handleAuthFailure("jsearch", "Invalid API key");

      expect(result).toEqual({ pausedCount: 5 });
    });

    it("should skip escalation when credential.required is false", async () => {
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { name: "JSearch", connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: false } },
      });

      const result = await handleAuthFailure("eures", "401 Unauthorized");

      expect(result).toEqual({ pausedCount: 0 });
      expect(mockRegistry.setStatus).not.toHaveBeenCalled();
      expect(mockPrisma.automation.updateMany).not.toHaveBeenCalled();
    });

    it("should create a notification for each affected automation", async () => {
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { name: "JSearch", connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-1", userId: "user-1", name: "Alpha Search" },
        { id: "auto-2", userId: "user-2", name: "Beta Search" },
      ]);

      await handleAuthFailure("jsearch", "401 Unauthorized");

      // Notifications now route through channelRouter.route() — one call per draft
      expect(mockRoute).toHaveBeenCalledTimes(2);
      expect(mockRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          type: "auth_failure",
          moduleId: "jsearch",
          automationId: "auto-1",
        }),
        expect.anything(),
      );
      expect(mockRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-2",
          type: "auth_failure",
          moduleId: "jsearch",
          automationId: "auto-2",
        }),
        expect.anything(),
      );
    });

    it("should populate data.titleKey + 5W+H metadata for late-bound i18n", async () => {
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { name: "JSearch", connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-late-bind", userId: "user-late-bind", name: "Late Bind Auto" },
      ]);

      await handleAuthFailure("jsearch", "401 Unauthorized");

      // channelRouter.route() receives the NotificationDraft as first arg
      expect(mockRoute).toHaveBeenCalledTimes(1);
      const draft = mockRoute.mock.calls[0][0];
      // `data` sub-object carries module/automation context
      expect(draft.data).toEqual(
        expect.objectContaining({
          moduleId: "jsearch",
          moduleName: "JSearch",
          automationId: "auto-late-bind",
          automationName: "Late Bind Auto",
        }),
      );
      // Top-level 5W+H fields on the draft (ADR-030 dual-write)
      expect(draft).toEqual(
        expect.objectContaining({
          titleKey: "notifications.authFailure.title",
          actorType: "module",
          actorId: "jsearch",
          reasonKey: "notifications.reason.authExpired",
          severity: "error",
        }),
      );
      // Backward-compat English `message` must still be populated
      expect(typeof draft.message).toBe("string");
      expect(draft.message.length).toBeGreaterThan(0);
    });

    it("should not create notifications when 0 automations are affected", async () => {
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([]);
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { name: "JSearch", connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });

      await handleAuthFailure("jsearch", "401 Unauthorized");

      expect(mockRoute).not.toHaveBeenCalled();
      // updateMany is also not called when findMany returns empty
      expect(mockPrisma.automation.updateMany).not.toHaveBeenCalled();
    });

    it("should still return pausedCount when notification creation fails", async () => {
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { name: "JSearch", connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-3", userId: "user-3", name: "Gamma Search" },
      ]);
      mockRoute.mockRejectedValueOnce(new Error("DB constraint violation"));

      const result = await handleAuthFailure("jsearch", "403 Forbidden");

      // Degradation response must not be blocked by notification failure
      expect(result).toEqual({ pausedCount: 1 });
    });
  });

  describe("checkConsecutiveRunFailures", () => {
    it("should NOT pause when fewer than 5 runs exist", async () => {
      (mockPrisma.automationRun.findMany as jest.Mock).mockResolvedValue([
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
      ]);

      const result = await checkConsecutiveRunFailures("auto-1");

      expect(result).toEqual({ paused: false });
      expect(mockPrisma.automation.update).not.toHaveBeenCalled();
    });

    it("should NOT pause when runs are mixed (not all failed)", async () => {
      (mockPrisma.automationRun.findMany as jest.Mock).mockResolvedValue([
        { status: "failed" },
        { status: "completed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
      ]);

      const result = await checkConsecutiveRunFailures("auto-2");

      expect(result).toEqual({ paused: false });
      expect(mockPrisma.automation.update).not.toHaveBeenCalled();
    });

    it("should pause when last 5 runs are all 'failed'", async () => {
      (mockPrisma.automationRun.findMany as jest.Mock).mockResolvedValue([
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
      ]);
      (mockPrisma.automation.findFirst as jest.Mock).mockResolvedValue({
        id: "auto-3",
        status: "active",
        name: "My Automation",
        userId: "user-1",
      });
      (mockPrisma.automation.update as jest.Mock).mockResolvedValue({});

      const result = await checkConsecutiveRunFailures("auto-3");

      expect(result).toEqual({ paused: true });
    });

    it("should set pauseReason to 'consecutive_failures'", async () => {
      (mockPrisma.automationRun.findMany as jest.Mock).mockResolvedValue([
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
      ]);
      (mockPrisma.automation.findFirst as jest.Mock).mockResolvedValue({
        id: "auto-4",
        status: "active",
        name: "Test Automation",
        userId: "user-1",
      });
      (mockPrisma.automation.update as jest.Mock).mockResolvedValue({});

      await checkConsecutiveRunFailures("auto-4");

      expect(mockPrisma.automation.update).toHaveBeenCalledWith({
        where: { id: "auto-4" },
        data: {
          status: "paused",
          pauseReason: "consecutive_failures",
        },
      });
    });

    it("should NOT pause when automation is already paused", async () => {
      (mockPrisma.automationRun.findMany as jest.Mock).mockResolvedValue([
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
      ]);
      (mockPrisma.automation.findFirst as jest.Mock).mockResolvedValue({
        id: "auto-5",
        status: "paused",
        name: "Already Paused",
        userId: "user-1",
      });

      const result = await checkConsecutiveRunFailures("auto-5");

      expect(result).toEqual({ paused: false });
      expect(mockPrisma.automation.update).not.toHaveBeenCalled();
    });

    it("should return { paused: false } on error", async () => {
      (mockPrisma.automationRun.findMany as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      const result = await checkConsecutiveRunFailures("auto-6");

      expect(result).toEqual({ paused: false });
    });

    it("should create a notification for the automation owner after pausing", async () => {
      (mockPrisma.automationRun.findMany as jest.Mock).mockResolvedValue([
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
      ]);
      (mockPrisma.automation.findFirst as jest.Mock).mockResolvedValue({
        id: "auto-notif",
        status: "active",
        name: "Notify Me Auto",
        userId: "user-notif",
      });
      (mockPrisma.automation.update as jest.Mock).mockResolvedValue({});

      await checkConsecutiveRunFailures("auto-notif");

      expect(mockRoute).toHaveBeenCalledTimes(1);
      expect(mockRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-notif",
          type: "consecutive_failures",
          automationId: "auto-notif",
        }),
        expect.anything(),
      );
    });

    it("should populate data.titleKey + 5W+H metadata for late-bound i18n", async () => {
      (mockPrisma.automationRun.findMany as jest.Mock).mockResolvedValue([
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
      ]);
      (mockPrisma.automation.findFirst as jest.Mock).mockResolvedValue({
        id: "auto-late-bind",
        status: "active",
        name: "Late Bind Cons",
        userId: "user-late-bind",
      });
      (mockPrisma.automation.update as jest.Mock).mockResolvedValue({});

      await checkConsecutiveRunFailures("auto-late-bind");

      expect(mockRoute).toHaveBeenCalledTimes(1);
      const draft = mockRoute.mock.calls[0][0];
      // Top-level draft fields
      expect(draft).toEqual(
        expect.objectContaining({
          userId: "user-late-bind",
          type: "consecutive_failures",
          automationId: "auto-late-bind",
          titleKey: "notifications.consecutiveFailures.title",
          titleParams: { count: 5 },
          actorType: "automation",
          actorId: "auto-late-bind",
          severity: "warning",
        }),
      );
      // `data` sub-object carries automation context
      expect(draft.data).toEqual(
        expect.objectContaining({
          automationId: "auto-late-bind",
          automationName: "Late Bind Cons",
          failureCount: 5,
        }),
      );
      expect(typeof draft.message).toBe("string");
      expect(draft.message.length).toBeGreaterThan(0);
    });
  });

  describe("handleCircuitBreakerTrip", () => {
    function registerModule(id: string, consecutiveFailures = 0) {
      const registered = {
        manifest: { id, name: id, connectorType: ConnectorType.JOB_DISCOVERY },
        status: ModuleStatus.ACTIVE,
        consecutiveFailures,
        circuitBreakerOpenSince: undefined as Date | undefined,
      };
      mockRegistry._testMap.set(id, registered);
      (mockRegistry.get as jest.Mock).mockImplementation(
        (moduleId: string) => mockRegistry._testMap.get(moduleId),
      );
      return registered;
    }

    it("should increment consecutiveFailures", async () => {
      const registered = registerModule("mod-cb-1", 0);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await handleCircuitBreakerTrip("mod-cb-1");

      expect(registered.consecutiveFailures).toBe(1);
    });

    it("should NOT pause below threshold (3)", async () => {
      registerModule("mod-cb-2", 0);

      const result = await handleCircuitBreakerTrip("mod-cb-2");

      expect(result).toEqual({ pausedCount: 0 });
      expect(mockPrisma.automation.updateMany).not.toHaveBeenCalled();
    });

    it("should NOT pause at 1 below threshold", async () => {
      registerModule("mod-cb-3", 1);

      const result = await handleCircuitBreakerTrip("mod-cb-3");

      // After increment: consecutiveFailures = 2, still below 3
      expect(result).toEqual({ pausedCount: 0 });
      expect(mockPrisma.automation.updateMany).not.toHaveBeenCalled();
    });

    it("should pause at threshold (3 consecutive opens)", async () => {
      registerModule("mod-cb-4", 2);
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-x", userId: "user-x", name: "Auto X" },
        { id: "auto-y", userId: "user-y", name: "Auto Y" },
      ]);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await handleCircuitBreakerTrip("mod-cb-4");

      // After increment: consecutiveFailures = 3, equals threshold
      expect(result).toEqual({ pausedCount: 2 });
      // TOCTOU-safe: findMany captures IDs, then updateMany targets those exact IDs
      expect(mockPrisma.automation.findMany).toHaveBeenCalledWith({
        where: { jobBoard: "mod-cb-4", status: "active" },
        select: { id: true, userId: true, name: true },
      });
      expect(mockPrisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["auto-x", "auto-y"] } },
        data: {
          status: "paused",
          pauseReason: "cb_escalation",
        },
      });
    });

    it("should return { pausedCount: 0 } for unknown module", async () => {
      (mockRegistry.get as jest.Mock).mockReturnValue(undefined);

      const result = await handleCircuitBreakerTrip("unknown-module");

      expect(result).toEqual({ pausedCount: 0 });
    });

    it("should set circuitBreakerOpenSince date", async () => {
      const registered = registerModule("mod-cb-5", 0);

      await handleCircuitBreakerTrip("mod-cb-5");

      expect(registered.circuitBreakerOpenSince).toBeInstanceOf(Date);
    });

    it("should set circuitBreakerState to OPEN", async () => {
      const registered = registerModule("mod-cb-6", 0) as any;
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await handleCircuitBreakerTrip("mod-cb-6");

      expect(registered.circuitBreakerState).toBe(CircuitBreakerState.OPEN);
    });

    it("should create notifications for affected automations when threshold is reached", async () => {
      registerModule("mod-cb-notif", 2);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-cb-1", userId: "user-cb-1", name: "CB Auto One" },
        { id: "auto-cb-2", userId: "user-cb-2", name: "CB Auto Two" },
      ]);

      await handleCircuitBreakerTrip("mod-cb-notif");

      // Notifications now route through channelRouter.route() — one call per draft
      expect(mockRoute).toHaveBeenCalledTimes(2);
      expect(mockRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-cb-1",
          type: "cb_escalation",
          moduleId: "mod-cb-notif",
          automationId: "auto-cb-1",
        }),
        expect.anything(),
      );
      expect(mockRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-cb-2",
          type: "cb_escalation",
          moduleId: "mod-cb-notif",
          automationId: "auto-cb-2",
        }),
        expect.anything(),
      );
    });

    it("should populate data.titleKey + 5W+H metadata for late-bound i18n", async () => {
      registerModule("mod-cb-late-bind", 2);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-late-bind", userId: "user-late-bind", name: "CB Late Bind" },
      ]);

      await handleCircuitBreakerTrip("mod-cb-late-bind");

      expect(mockRoute).toHaveBeenCalledTimes(1);
      const draft = mockRoute.mock.calls[0][0];
      // `data` sub-object carries module/automation context
      expect(draft.data).toEqual(
        expect.objectContaining({
          moduleId: "mod-cb-late-bind",
          moduleName: "mod-cb-late-bind",
          automationId: "auto-late-bind",
          automationName: "CB Late Bind",
          failureCount: 3,
        }),
      );
      // Top-level 5W+H fields on the draft (ADR-030 dual-write)
      expect(draft).toEqual(
        expect.objectContaining({
          titleKey: "notifications.cbEscalation.title",
          actorType: "module",
          actorId: "mod-cb-late-bind",
          reasonKey: "notifications.reason.circuitBreaker",
          severity: "warning",
        }),
      );
      expect(typeof draft.message).toBe("string");
      expect(draft.message.length).toBeGreaterThan(0);
    });

    it("should not create notifications below threshold", async () => {
      registerModule("mod-cb-no-notif", 0);

      await handleCircuitBreakerTrip("mod-cb-no-notif");

      expect(mockRoute).not.toHaveBeenCalled();
      expect(mockPrisma.automation.findMany).not.toHaveBeenCalled();
    });
  });

  describe("handleCircuitBreakerRecovery", () => {
    it("should reset consecutiveFailures to 0", () => {
      const registered = {
        consecutiveFailures: 5,
        circuitBreakerOpenSince: new Date(),
      };
      mockRegistry._testMap.set("mod-recover", registered);
      (mockRegistry.get as jest.Mock).mockImplementation(
        (moduleId: string) => mockRegistry._testMap.get(moduleId),
      );

      handleCircuitBreakerRecovery("mod-recover");

      expect(registered.consecutiveFailures).toBe(0);
      expect(registered.circuitBreakerOpenSince).toBeUndefined();
    });

    it("should set circuitBreakerState to CLOSED", () => {
      const registered: any = {
        consecutiveFailures: 3,
        circuitBreakerState: CircuitBreakerState.OPEN,
        circuitBreakerOpenSince: new Date(),
      };
      mockRegistry._testMap.set("mod-recover-state", registered);
      (mockRegistry.get as jest.Mock).mockImplementation(
        (moduleId: string) => mockRegistry._testMap.get(moduleId),
      );

      handleCircuitBreakerRecovery("mod-recover-state");

      expect(registered.circuitBreakerState).toBe(CircuitBreakerState.CLOSED);
    });

    it("should be a no-op for unknown module", () => {
      (mockRegistry.get as jest.Mock).mockReturnValue(undefined);

      // Should not throw
      expect(() => handleCircuitBreakerRecovery("unknown")).not.toThrow();
    });
  });

  // ===========================================================================
  // Preference gating — ChannelRouter (IF-4 refactor)
  //
  // After the IF-4 refactor, degradation.ts routes all notifications through
  // `channelRouter.route()`. The ChannelRouter handles preference gating
  // (shouldNotify, quiet hours, per-type toggles) internally. Degradation
  // always calls route() — it is the router's responsibility to suppress
  // delivery based on user preferences.
  //
  // These tests verify that degradation correctly routes drafts to the
  // channelRouter regardless of user preference state.
  // ===========================================================================

  describe("ChannelRouter integration (preference gating is router's concern)", () => {
    it("handleAuthFailure — routes draft to channelRouter (router handles preferences)", async () => {
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: {
          name: "JSearch",
          connectorType: ConnectorType.JOB_DISCOVERY,
          credential: { required: true },
        },
      });
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-1", userId: "user-off", name: "Off Auto" },
      ]);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const result = await handleAuthFailure("jsearch", "401 Unauthorized");

      // Degradation pauses and routes — the router handles suppression
      expect(result).toEqual({ pausedCount: 1 });
      expect(mockPrisma.automation.updateMany).toHaveBeenCalled();
      expect(mockRoute).toHaveBeenCalledTimes(1);
      expect(mockRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-off",
          type: "auth_failure",
        }),
        expect.anything(),
      );
    });

    it("handleAuthFailure — builds dispatch context per unique userId", async () => {
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: {
          name: "JSearch",
          connectorType: ConnectorType.JOB_DISCOVERY,
          credential: { required: true },
        },
      });
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-1", userId: "user-a", name: "Auto A" },
        { id: "auto-2", userId: "user-b", name: "Auto B" },
        { id: "auto-3", userId: "user-a", name: "Auto A2" },
      ]);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 3,
      });

      await handleAuthFailure("jsearch", "401 Unauthorized");

      // 2 unique userIds → 2 context builds
      expect(mockBuildDispatchContext).toHaveBeenCalledTimes(2);
      expect(mockBuildDispatchContext).toHaveBeenCalledWith("user-a");
      expect(mockBuildDispatchContext).toHaveBeenCalledWith("user-b");
      // 3 drafts → 3 route calls
      expect(mockRoute).toHaveBeenCalledTimes(3);
    });

    it("handleAuthFailure — still routes draft when the user has defaults (null settings)", async () => {
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: {
          name: "JSearch",
          connectorType: ConnectorType.JOB_DISCOVERY,
          credential: { required: true },
        },
      });
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-1", userId: "user-default", name: "Default Auto" },
      ]);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      await handleAuthFailure("jsearch", "401 Unauthorized");

      expect(mockRoute).toHaveBeenCalledTimes(1);
    });

    it("checkConsecutiveRunFailures — routes draft to channelRouter", async () => {
      (mockPrisma.automationRun.findMany as jest.Mock).mockResolvedValue([
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
        { status: "failed" },
      ]);
      (mockPrisma.automation.findFirst as jest.Mock).mockResolvedValue({
        id: "auto-gated",
        status: "active",
        name: "Gated Auto",
        userId: "user-gated",
      });
      (mockPrisma.automation.update as jest.Mock).mockResolvedValue({});

      const result = await checkConsecutiveRunFailures("auto-gated");

      // Pausing still happens — router handles preference gating
      expect(result).toEqual({ paused: true });
      expect(mockPrisma.automation.update).toHaveBeenCalled();
      expect(mockRoute).toHaveBeenCalledTimes(1);
      expect(mockRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-gated",
          type: "consecutive_failures",
        }),
        expect.anything(),
      );
    });

    it("handleCircuitBreakerTrip — routes draft to channelRouter", async () => {
      mockRegistry._testMap.set("mod-cb-gate", {
        manifest: {
          id: "mod-cb-gate",
          name: "mod-cb-gate",
          connectorType: ConnectorType.JOB_DISCOVERY,
        },
        status: ModuleStatus.ACTIVE,
        consecutiveFailures: 2,
      });
      (mockRegistry.get as jest.Mock).mockImplementation((id: string) =>
        mockRegistry._testMap.get(id),
      );
      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-cb-gate", userId: "user-cb-gate", name: "CB Gated" },
      ]);
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      const result = await handleCircuitBreakerTrip("mod-cb-gate");

      // Pausing still happens — router handles preference gating
      expect(result).toEqual({ pausedCount: 1 });
      expect(mockPrisma.automation.updateMany).toHaveBeenCalled();
      expect(mockRoute).toHaveBeenCalledTimes(1);
      expect(mockRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-cb-gate",
          type: "cb_escalation",
        }),
        expect.anything(),
      );
    });
  });
});
