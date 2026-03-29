// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// Mock debug to silence scheduler log output
jest.mock("@/lib/debug", () => ({
  debugLog: jest.fn(),
}));

jest.mock("@/lib/connector/health-monitor", () => ({
  checkModuleHealth: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/connector/registry", () => {
  const registryStore = new Map<string, any>();
  return {
    moduleRegistry: {
      availableModules: jest.fn(() => [...registryStore.keys()]),
      get: jest.fn((id: string) => registryStore.get(id)),
      _testStore: registryStore,
    },
  };
});

import { checkModuleHealth } from "@/lib/connector/health-monitor";
import { moduleRegistry } from "@/lib/connector/registry";
import { ModuleStatus, ConnectorType, CredentialType, HealthStatus, CircuitBreakerState } from "@/lib/connector/manifest";

// Health-scheduler uses module-level state (schedulerStarted flag + timers map).
// We must re-require the module fresh after each stopHealthScheduler() to avoid
// state leakage between tests. The pattern used here is to import the module
// functions directly but reset state via stopHealthScheduler() between tests.
import { startHealthScheduler, stopHealthScheduler } from "@/lib/connector/health-scheduler";

const mockCheckModuleHealth = checkModuleHealth as jest.MockedFunction<typeof checkModuleHealth>;
const mockRegistry = moduleRegistry as jest.Mocked<typeof moduleRegistry> & {
  _testStore: Map<string, any>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function registerModule(
  id: string,
  options: {
    status?: ModuleStatus;
    healthCheck?: { intervalMs: number; timeoutMs: number; endpoint?: string } | undefined;
  } = {},
) {
  const mod = {
    manifest: {
      id,
      name: `Test ${id}`,
      connectorType: ConnectorType.JOB_DISCOVERY,
      credential: {
        type: CredentialType.NONE,
        moduleId: id,
        required: false,
        sensitive: false,
      },
      healthCheck: options.healthCheck,
    },
    status: options.status ?? ModuleStatus.ACTIVE,
    healthStatus: HealthStatus.UNKNOWN,
    circuitBreakerState: CircuitBreakerState.CLOSED,
    consecutiveFailures: 0,
  };
  mockRegistry._testStore.set(id, mod);
  return mod;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Health Scheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockRegistry._testStore.clear();
    // Always stop first to reset the module-level schedulerStarted flag
    stopHealthScheduler();
  });

  afterEach(() => {
    stopHealthScheduler();
    jest.useRealTimers();
  });

  describe("startHealthScheduler", () => {
    it("calls checkModuleHealth for active modules with healthCheck config after interval", () => {
      registerModule("mod-health-a", {
        healthCheck: { intervalMs: 60_000, timeoutMs: 5_000 },
      });

      startHealthScheduler();

      // Periodic interval fires at intervalMs
      jest.advanceTimersByTime(60_000);

      expect(mockCheckModuleHealth).toHaveBeenCalledWith("mod-health-a");
    });

    it("does not schedule checks for modules without healthCheck config", () => {
      registerModule("mod-no-health", { healthCheck: undefined });

      startHealthScheduler();

      jest.advanceTimersByTime(300_000);

      expect(mockCheckModuleHealth).not.toHaveBeenCalled();
    });

    it("does not schedule checks for inactive modules", () => {
      registerModule("mod-inactive", {
        status: ModuleStatus.INACTIVE,
        healthCheck: { intervalMs: 30_000, timeoutMs: 5_000 },
      });

      startHealthScheduler();

      jest.advanceTimersByTime(300_000);

      expect(mockCheckModuleHealth).not.toHaveBeenCalled();
    });

    it("schedules multiple active modules with healthCheck independently", () => {
      registerModule("mod-fast", {
        healthCheck: { intervalMs: 30_000, timeoutMs: 5_000 },
      });
      registerModule("mod-slow", {
        healthCheck: { intervalMs: 120_000, timeoutMs: 5_000 },
      });

      startHealthScheduler();

      // Before 10s: no calls (warm-up period)
      jest.advanceTimersByTime(9_999);
      expect(mockCheckModuleHealth).not.toHaveBeenCalled();

      // At 10s: both initial warm-up timeouts fire
      jest.advanceTimersByTime(1);
      expect(mockCheckModuleHealth).toHaveBeenCalledWith("mod-fast");
      expect(mockCheckModuleHealth).toHaveBeenCalledWith("mod-slow");

      mockCheckModuleHealth.mockClear();

      // At 30s total: mod-fast periodic interval fires, mod-slow does not
      jest.advanceTimersByTime(20_000);
      expect(mockCheckModuleHealth).toHaveBeenCalledWith("mod-fast");
      expect(mockCheckModuleHealth).not.toHaveBeenCalledWith("mod-slow");

      mockCheckModuleHealth.mockClear();

      // At 120s total: mod-slow periodic interval fires
      jest.advanceTimersByTime(90_000);
      expect(mockCheckModuleHealth).toHaveBeenCalledWith("mod-slow");
    });

    it("is idempotent — calling startHealthScheduler twice only creates timers once", () => {
      registerModule("mod-idem", {
        healthCheck: { intervalMs: 60_000, timeoutMs: 5_000 },
      });

      startHealthScheduler();
      startHealthScheduler(); // second call must be a no-op

      jest.advanceTimersByTime(60_000);

      // 1 initial warmup at 10s + 1 periodic interval at 60s = 2 calls
      // If timers were doubled, this would be 4
      expect(mockCheckModuleHealth).toHaveBeenCalledTimes(2);
    });

    it("fires the initial warm-up check after 10 seconds", () => {
      registerModule("mod-warmup", {
        healthCheck: { intervalMs: 300_000, timeoutMs: 5_000 },
      });

      startHealthScheduler();

      // Before 10s: no calls
      jest.advanceTimersByTime(9_999);
      expect(mockCheckModuleHealth).not.toHaveBeenCalled();

      // At 10s: initial setTimeout fires
      jest.advanceTimersByTime(1);
      expect(mockCheckModuleHealth).toHaveBeenCalledWith("mod-warmup");
    });
  });

  describe("stopHealthScheduler", () => {
    it("clears all timers so no further checks are executed", () => {
      registerModule("mod-stop", {
        healthCheck: { intervalMs: 30_000, timeoutMs: 5_000 },
      });

      startHealthScheduler();
      stopHealthScheduler();

      jest.advanceTimersByTime(300_000);

      expect(mockCheckModuleHealth).not.toHaveBeenCalled();
    });

    it("allows re-starting the scheduler after a stop", () => {
      registerModule("mod-restart", {
        healthCheck: { intervalMs: 60_000, timeoutMs: 5_000 },
      });

      startHealthScheduler();
      stopHealthScheduler();

      // Re-start: scheduler should set up fresh timers
      startHealthScheduler();

      jest.advanceTimersByTime(60_000);

      expect(mockCheckModuleHealth).toHaveBeenCalledWith("mod-restart");
    });
  });

  describe("error resilience", () => {
    it("health check errors do not crash the scheduler — subsequent intervals still fire", async () => {
      registerModule("mod-error", {
        healthCheck: { intervalMs: 60_000, timeoutMs: 5_000 },
      });

      // First call (initial warmup at 10s) rejects, subsequent calls resolve
      mockCheckModuleHealth
        .mockRejectedValueOnce(new Error("health probe failed"))
        .mockResolvedValue({ success: false, healthStatus: "degraded" as any, moduleId: "mod-error", responseTimeMs: 0 });

      startHealthScheduler();

      // Trigger initial warmup at 10s — should reject but not crash
      jest.advanceTimersByTime(10_000);
      // Flush the rejected promise
      await Promise.resolve();

      // Trigger first periodic interval at 60s
      jest.advanceTimersByTime(50_000);
      await Promise.resolve();

      // Trigger second periodic interval at 120s — scheduler must still be running
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();

      // 1 initial warmup + 2 periodic intervals = 3 calls
      expect(mockCheckModuleHealth).toHaveBeenCalledTimes(3);
    });
  });
});
