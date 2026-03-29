// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

jest.mock("@/lib/db", () => {
  const mockPrisma = {
    moduleRegistration: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    automation: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    automationRun: {
      findMany: jest.fn(),
    },
  };
  return { __esModule: true, default: mockPrisma };
});

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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockRegistry = moduleRegistry as jest.Mocked<typeof moduleRegistry> & {
  _testMap: Map<string, any>;
};

describe("Degradation Rules", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });

      await handleAuthFailure("eures", "401 Unauthorized");

      expect(mockRegistry.setStatus).toHaveBeenCalledWith("eures", ModuleStatus.ERROR);
    });

    it("should pause active automations with pauseReason 'auth_failure'", async () => {
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });

      await handleAuthFailure("openai", "403 Forbidden");

      expect(mockPrisma.automation.updateMany).toHaveBeenCalledWith({
        where: {
          jobBoard: "openai",
          status: "active",
        },
        data: {
          status: "paused",
          pauseReason: "auth_failure",
        },
      });
    });

    it("should return the count of paused automations", async () => {
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 5 });
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: true } },
      });

      const result = await handleAuthFailure("jsearch", "Invalid API key");

      expect(result).toEqual({ pausedCount: 5 });
    });

    it("should skip escalation when credential.required is false", async () => {
      (mockRegistry.get as jest.Mock).mockReturnValue({
        manifest: { connectorType: ConnectorType.JOB_DISCOVERY, credential: { required: false } },
      });

      const result = await handleAuthFailure("eures", "401 Unauthorized");

      expect(result).toEqual({ pausedCount: 0 });
      expect(mockRegistry.setStatus).not.toHaveBeenCalled();
      expect(mockPrisma.automation.updateMany).not.toHaveBeenCalled();
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
      (mockPrisma.automation.findUnique as jest.Mock).mockResolvedValue({
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
      (mockPrisma.automation.findUnique as jest.Mock).mockResolvedValue({
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
      (mockPrisma.automation.findUnique as jest.Mock).mockResolvedValue({
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
  });

  describe("handleCircuitBreakerTrip", () => {
    function registerModule(id: string, consecutiveFailures = 0) {
      const registered = {
        manifest: { id, connectorType: ConnectorType.JOB_DISCOVERY },
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
      (mockPrisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await handleCircuitBreakerTrip("mod-cb-4");

      // After increment: consecutiveFailures = 3, equals threshold
      expect(result).toEqual({ pausedCount: 2 });
      expect(mockPrisma.automation.updateMany).toHaveBeenCalledWith({
        where: {
          jobBoard: "mod-cb-4",
          status: "active",
        },
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
});
