// Polyfill AbortSignal.timeout for jsdom test environment
if (typeof AbortSignal.timeout !== "function") {
  (AbortSignal as unknown as Record<string, unknown>).timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

jest.mock("@/lib/db", () => {
  const mockPrisma = {
    moduleRegistration: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    automation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return { __esModule: true, default: mockPrisma };
});

jest.mock("@/lib/events", () => ({
  emitEvent: jest.fn(),
  createEvent: jest.fn((_type: string, payload: any) => ({
    type: _type,
    timestamp: new Date(),
    payload,
  })),
}));

// BP-1: Mock degradation + url-validation to prevent live imports
jest.mock("@/lib/connector/degradation", () => ({
  handleAuthFailure: jest.fn().mockResolvedValue({ pausedCount: 0 }),
  truncate: jest.fn((v: string) => v.length > 200 ? v.slice(0, 200) : v),
  emitDegradationEvents: jest.fn(),
}));

jest.mock("@/lib/url-validation", () => ({
  isBlockedHealthCheckUrl: jest.fn(() => false),
}));

jest.mock("@/lib/connector/registry", () => {
  const registryStore = new Map<string, any>();
  return {
    moduleRegistry: {
      get: jest.fn((id: string) => registryStore.get(id)),
      availableModules: jest.fn(() => [...registryStore.keys()]),
      updateHealth: jest.fn((id: string, healthStatus: any, lastCheck: Date, lastSuccess?: Date, consecutiveFailures?: number) => {
        const entry = registryStore.get(id);
        if (!entry) return false;
        entry.healthStatus = healthStatus;
        entry.lastHealthCheck = lastCheck;
        if (lastSuccess) entry.lastSuccessfulConnection = lastSuccess;
        if (consecutiveFailures !== undefined) entry.consecutiveFailures = consecutiveFailures;
        return true;
      }),
      _testStore: registryStore,
    },
  };
});

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkModuleHealth } from "@/lib/connector/health-monitor";
import { moduleRegistry } from "@/lib/connector/registry";
import { emitEvent, createEvent } from "@/lib/events";
import { emitDegradationEvents } from "@/lib/connector/degradation";
import prisma from "@/lib/db";
import {
  HealthStatus,
  ModuleStatus,
  CircuitBreakerState,
  ConnectorType,
  CredentialType,
} from "@/lib/connector/manifest";

const mockEmitEvent = emitEvent as jest.MockedFunction<typeof emitEvent>;
const mockCreateEvent = createEvent as jest.MockedFunction<typeof createEvent>;
const mockEmitDegradationEvents = emitDegradationEvents as jest.MockedFunction<typeof emitDegradationEvents>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockRegistry = moduleRegistry as jest.Mocked<typeof moduleRegistry> & {
  _testStore: Map<string, any>;
};

describe("Health Monitor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistry._testStore.clear();
  });

  function registerActiveModule(
    id: string,
    healthCheck?: { endpoint?: string; timeoutMs: number; intervalMs: number },
    overrides: Record<string, any> = {},
  ) {
    const registered = {
      manifest: {
        id,
        name: `Test ${id}`,
        connectorType: ConnectorType.JOB_DISCOVERY,
        credential: {
          type: CredentialType.NONE,
          moduleId: id,
          required: false,
          sensitive: false,
          defaultValue: overrides.credentialDefault,
        },
        healthCheck,
      },
      status: overrides.status ?? ModuleStatus.ACTIVE,
      healthStatus: overrides.healthStatus ?? HealthStatus.UNKNOWN,
      circuitBreakerState: CircuitBreakerState.CLOSED,
      consecutiveFailures: overrides.consecutiveFailures ?? 0,
      lastHealthCheck: undefined as Date | undefined,
      lastSuccessfulConnection: undefined as Date | undefined,
    };
    mockRegistry._testStore.set(id, registered);
    return registered;
  }

  describe("checkModuleHealth", () => {
    it("should return UNKNOWN for module not found in registry", async () => {
      const result = await checkModuleHealth("nonexistent");

      expect(result.healthStatus).toBe(HealthStatus.UNKNOWN);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should return UNKNOWN for inactive module", async () => {
      registerActiveModule("inactive-mod", undefined, {
        status: ModuleStatus.INACTIVE,
      });

      const result = await checkModuleHealth("inactive-mod");

      expect(result.healthStatus).toBe(HealthStatus.UNKNOWN);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not active");
    });

    it("should return UNKNOWN for module without healthCheck config", async () => {
      registerActiveModule("no-health", undefined);

      const result = await checkModuleHealth("no-health");

      expect(result.healthStatus).toBe(HealthStatus.UNKNOWN);
      expect(result.success).toBe(true);
      expect(result.responseTimeMs).toBe(0);
    });

    it("should return HEALTHY when probe succeeds", async () => {
      registerActiveModule("healthy-mod", {
        endpoint: "https://api.example.com/health",
        timeoutMs: 5000,
        intervalMs: 300000,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const result = await checkModuleHealth("healthy-mod");

      expect(result.healthStatus).toBe(HealthStatus.HEALTHY);
      expect(result.success).toBe(true);
      expect(result.moduleId).toBe("healthy-mod");
    });

    it("should return DEGRADED after first probe failure (from UNKNOWN state)", async () => {
      registerActiveModule(
        "degraded-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { healthStatus: HealthStatus.UNKNOWN, consecutiveFailures: 0 },
      );

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      const result = await checkModuleHealth("degraded-mod");

      expect(result.healthStatus).toBe(HealthStatus.DEGRADED);
      expect(result.success).toBe(false);
    });

    it("should return DEGRADED after second consecutive failure", async () => {
      const registered = registerActiveModule(
        "degraded2-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { healthStatus: HealthStatus.DEGRADED, consecutiveFailures: 1 },
      );

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      const result = await checkModuleHealth("degraded2-mod");

      expect(result.healthStatus).toBe(HealthStatus.DEGRADED);
      expect(registered.healthStatus).toBe(HealthStatus.DEGRADED);
    });

    it("should return UNREACHABLE after 3+ consecutive failures", async () => {
      const registered = registerActiveModule(
        "unreachable-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { healthStatus: HealthStatus.DEGRADED, consecutiveFailures: 2 },
      );

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await checkModuleHealth("unreachable-mod");

      // 2 previous + 1 new = 3 -> UNREACHABLE
      expect(result.healthStatus).toBe(HealthStatus.UNREACHABLE);
      expect(registered.healthStatus).toBe(HealthStatus.UNREACHABLE);
    });

    it("should update registered module healthStatus in-memory", async () => {
      const registered = registerActiveModule("mem-update-mod", {
        endpoint: "https://api.example.com/health",
        timeoutMs: 5000,
        intervalMs: 300000,
      });

      expect(registered.healthStatus).toBe(HealthStatus.UNKNOWN);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      await checkModuleHealth("mem-update-mod");

      expect(registered.healthStatus).toBe(HealthStatus.HEALTHY);
      expect(registered.lastHealthCheck).toBeInstanceOf(Date);
      expect(registered.lastSuccessfulConnection).toBeInstanceOf(Date);
    });

    it("should handle fetch throwing an error (network failure)", async () => {
      registerActiveModule("net-fail-mod", {
        endpoint: "https://api.example.com/health",
        timeoutMs: 5000,
        intervalMs: 300000,
      });

      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await checkModuleHealth("net-fail-mod");

      expect(result.success).toBe(false);
      expect(result.healthStatus).toBe(HealthStatus.DEGRADED);
      expect(result.error).toBe("Network error");
    });

    it("should handle relative endpoint by resolving against credential defaultValue", async () => {
      registerActiveModule(
        "relative-mod",
        {
          endpoint: "/api/tags",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { credentialDefault: "http://127.0.0.1:11434" },
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const result = await checkModuleHealth("relative-mod");

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:11434/api/tags",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should reset to HEALTHY on successful probe after failures", async () => {
      const registered = registerActiveModule(
        "recover-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { healthStatus: HealthStatus.DEGRADED, consecutiveFailures: 2 },
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      const result = await checkModuleHealth("recover-mod");

      expect(result.healthStatus).toBe(HealthStatus.HEALTHY);
      expect(registered.healthStatus).toBe(HealthStatus.HEALTHY);
    });

    it("should increment consecutiveFailures on each failed health check", async () => {
      const registered = registerActiveModule("fail-counter-mod", {
        endpoint: "https://api.example.com/health",
        timeoutMs: 5000,
        intervalMs: 300000,
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      expect(registered.consecutiveFailures).toBe(0);

      await checkModuleHealth("fail-counter-mod");
      expect(registered.consecutiveFailures).toBe(1);

      await checkModuleHealth("fail-counter-mod");
      expect(registered.consecutiveFailures).toBe(2);
    });

    it("should reset consecutiveFailures to zero on successful probe", async () => {
      const registered = registerActiveModule(
        "reset-counter-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { healthStatus: HealthStatus.DEGRADED, consecutiveFailures: 2 },
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      await checkModuleHealth("reset-counter-mod");
      expect(registered.consecutiveFailures).toBe(0);
    });

    it("should reach UNREACHABLE through repeated health check calls", async () => {
      const registered = registerActiveModule("repeated-fail-mod", {
        endpoint: "https://api.example.com/health",
        timeoutMs: 5000,
        intervalMs: 300000,
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      // Call 1: consecutiveFailures goes from 0 -> 1, status = DEGRADED
      const r1 = await checkModuleHealth("repeated-fail-mod");
      expect(r1.healthStatus).toBe(HealthStatus.DEGRADED);
      expect(registered.consecutiveFailures).toBe(1);

      // Call 2: consecutiveFailures goes from 1 -> 2, status = DEGRADED
      const r2 = await checkModuleHealth("repeated-fail-mod");
      expect(r2.healthStatus).toBe(HealthStatus.DEGRADED);
      expect(registered.consecutiveFailures).toBe(2);

      // Call 3: consecutiveFailures goes from 2 -> 3, status = UNREACHABLE
      const r3 = await checkModuleHealth("repeated-fail-mod");
      expect(r3.healthStatus).toBe(HealthStatus.UNREACHABLE);
      expect(registered.consecutiveFailures).toBe(3);
    });

    it("should handle healthCheck with no endpoint as healthy", async () => {
      registerActiveModule("no-endpoint-mod", {
        timeoutMs: 5000,
        intervalMs: 300000,
      });

      const result = await checkModuleHealth("no-endpoint-mod");

      expect(result.success).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return failure when relative endpoint has no base URL", async () => {
      registerActiveModule(
        "no-base-mod",
        {
          endpoint: "/api/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { credentialDefault: undefined },
      );

      const result = await checkModuleHealth("no-base-mod");

      expect(result.success).toBe(false);
    });
  });

  describe("HealthStatusEscalation (CB-2)", () => {
    it("emits AutomationDegraded event when module transitions to UNREACHABLE", async () => {
      registerActiveModule(
        "escalation-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { healthStatus: HealthStatus.DEGRADED, consecutiveFailures: 2 },
      );

      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-1", userId: "user-1", name: "My Automation" },
      ]);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await checkModuleHealth("escalation-mod");

      expect(mockEmitDegradationEvents).toHaveBeenCalledWith(
        [{ id: "auto-1", userId: "user-1", name: "My Automation" }],
        expect.objectContaining({
          reason: "health_unreachable",
          moduleId: "escalation-mod",
        }),
        expect.any(Function),
      );
    });

    it("does NOT emit when module is already UNREACHABLE (no re-fire)", async () => {
      registerActiveModule(
        "already-unreachable-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { healthStatus: HealthStatus.UNREACHABLE, consecutiveFailures: 5 },
      );

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await checkModuleHealth("already-unreachable-mod");

      expect(mockEmitDegradationEvents).not.toHaveBeenCalled();
    });

    it("does NOT emit when module recovers to HEALTHY", async () => {
      registerActiveModule(
        "recovering-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { healthStatus: HealthStatus.DEGRADED, consecutiveFailures: 2 },
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      await checkModuleHealth("recovering-mod");

      expect(mockEmitDegradationEvents).not.toHaveBeenCalled();
    });

    it("emits one event per affected automation", async () => {
      registerActiveModule(
        "multi-auto-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { healthStatus: HealthStatus.DEGRADED, consecutiveFailures: 2 },
      );

      (mockPrisma.automation.findMany as jest.Mock).mockResolvedValue([
        { id: "auto-a", userId: "user-a", name: "Automation A" },
        { id: "auto-b", userId: "user-b", name: "Automation B" },
        { id: "auto-c", userId: "user-a", name: "Automation C" },
      ]);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await checkModuleHealth("multi-auto-mod");

      expect(mockEmitDegradationEvents).toHaveBeenCalledWith(
        [
          { id: "auto-a", userId: "user-a", name: "Automation A" },
          { id: "auto-b", userId: "user-b", name: "Automation B" },
          { id: "auto-c", userId: "user-a", name: "Automation C" },
        ],
        expect.objectContaining({ reason: "health_unreachable", moduleId: "multi-auto-mod" }),
        expect.any(Function),
      );
    });
  });

  // Regression guard for E2E-B18. Health is an observation; lifecycle
  // (active/inactive) is an intention asserted only by the admin-gated
  // activate/deactivateModule. A row materialised by a health probe must
  // therefore carry no `status`, so the schema default supplies it and a
  // deleted row still resolves to the manifest default (ADR-043).
  describe("DB persistence writes health only, never lifecycle", () => {
    it("omits status from the upsert create payload", async () => {
      registerActiveModule("persist-mod", {
        endpoint: "https://api.example.com/health",
        timeoutMs: 5000,
        intervalMs: 300000,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
      });

      await checkModuleHealth("persist-mod");

      const upsert = mockPrisma.moduleRegistration.upsert as jest.Mock;
      expect(upsert).toHaveBeenCalledTimes(1);
      const payload = upsert.mock.calls[0][0];

      expect(payload.create).not.toHaveProperty("status");
      expect(payload.create).toEqual({
        moduleId: "persist-mod",
        connectorType: ConnectorType.JOB_DISCOVERY,
        healthStatus: HealthStatus.HEALTHY,
      });

      expect(payload.update).not.toHaveProperty("status");
      expect(payload.update).toEqual(
        expect.objectContaining({ healthStatus: HealthStatus.HEALTHY }),
      );
    });

    it("does not persist at all for a non-active module", async () => {
      // The status guard is what actually blocks the E2E-B18 resurrection
      // narrative: a process holding a stale INACTIVE never reaches the
      // upsert, so it cannot write that stale value back. Pinned here so a
      // future relaxation of the guard cannot silently re-open the path.
      registerActiveModule(
        "stale-inactive-mod",
        {
          endpoint: "https://api.example.com/health",
          timeoutMs: 5000,
          intervalMs: 300000,
        },
        { status: ModuleStatus.INACTIVE },
      );

      const result = await checkModuleHealth("stale-inactive-mod");

      expect(result.error).toContain("not active");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockPrisma.moduleRegistration.upsert).not.toHaveBeenCalled();
    });

    it("keeps the DB column default equal to the manifest default", () => {
      // ADR-043 rests on an equivalence: the column default this code now
      // delegates to must be the same value the registry gives a freshly
      // registered module. Half of that was already pinned — registry.ts's
      // ModuleStatus.ACTIVE by module-registry.spec.ts — and half by nothing.
      // Change the schema default to "inactive" and every unit test stays
      // green while the E2E module reset (which deletes rows so the default
      // reapplies) silently inverts. Both sources are checked, because schema
      // and migration drifting apart is its own failure mode.
      const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
      const model = schema.slice(schema.indexOf("model ModuleRegistration"));
      const body = model.slice(0, model.indexOf("\n}"));
      const declared = body.match(/status\s+String\s+@default\("([^"]+)"\)/)?.[1];
      expect(declared).toBe(ModuleStatus.ACTIVE);

      const migration = readFileSync(
        join(
          process.cwd(),
          "prisma/migrations/20260329013355_add_module_lifecycle/migration.sql",
        ),
        "utf8",
      );
      expect(migration).toContain(
        `"status" TEXT NOT NULL DEFAULT '${ModuleStatus.ACTIVE}'`,
      );
    });
  });
});
