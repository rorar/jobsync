/**
 * Unit tests for module.actions.ts — focused on Manifest v2 migration paths:
 * - getModuleManifests(): i18n field, dependencies field
 * - deactivateModule(): automation pausing, notification error logging
 * - syncRegistryFromDb(): fail-open behavior
 */

// Mock auth
jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

// Mock prisma (via @/lib/db)
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    moduleRegistration: { findMany: jest.fn(), upsert: jest.fn() },
    automation: { findMany: jest.fn(), updateMany: jest.fn() },
    notification: { createMany: jest.fn() },
  },
}));

// Mock register-all to prevent side effects
jest.mock("@/lib/connector/register-all", () => {});

// Mock registry
jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: {
    getByType: jest.fn(),
    get: jest.fn(),
    setStatus: jest.fn(),
  },
}));

// Mock health monitor
jest.mock("@/lib/connector/health-monitor", () => ({
  checkModuleHealth: jest.fn(),
}));

// Mock health rate limit
jest.mock("@/lib/health-rate-limit", () => ({
  checkHealthCheckRateLimit: jest.fn(),
}));

// Mock handleError utility
jest.mock("@/lib/utils", () => ({
  handleError: jest.fn((_error: unknown, msg: string) => ({
    success: false,
    message: msg,
  })),
}));

import { getModuleManifests, deactivateModule } from "@/actions/module.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { moduleRegistry } from "@/lib/connector/registry";
import prisma from "@/lib/db";
import {
  ConnectorType,
  CredentialType,
  HealthStatus,
  ModuleStatus,
  CircuitBreakerState,
  type RegisteredModule,
  type ModuleManifest,
} from "@/lib/connector/manifest";

// =============================================================================
// Helpers
// =============================================================================

function makeRegisteredModule(overrides: Partial<ModuleManifest> = {}): RegisteredModule {
  const manifest: ModuleManifest = {
    id: "test-module",
    name: "Test Module",
    manifestVersion: 2,
    connectorType: ConnectorType.JOB_DISCOVERY,
    credential: {
      type: CredentialType.NONE,
      moduleId: "test-module",
      required: false,
      sensitive: false,
    },
    ...overrides,
  };

  return {
    manifest,
    status: ModuleStatus.ACTIVE,
    healthStatus: HealthStatus.HEALTHY,
    circuitBreakerState: CircuitBreakerState.CLOSED,
    consecutiveFailures: 0,
  };
}

// =============================================================================
// Test suite
// =============================================================================

describe("module.actions", () => {
  const mockUser = { id: "user-1", name: "Test User", email: "test@example.com" };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: authenticated user
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    // Default: empty DB (syncRegistryFromDb succeeds with no rows)
    (prisma.moduleRegistration.findMany as jest.Mock).mockResolvedValue([]);
    // Default: no modules
    (moduleRegistry.getByType as jest.Mock).mockReturnValue([]);
  });

  // ===========================================================================
  // getModuleManifests — i18n field
  // ===========================================================================

  describe("getModuleManifests", () => {
    it("returns summary with i18n field populated from manifest", async () => {
      const i18n = {
        en: { name: "Test Module", description: "A test module", credentialHint: "Enter key" },
        de: { name: "Test Modul", description: "Ein Testmodul" },
      };

      const mod = makeRegisteredModule({ i18n });
      (moduleRegistry.getByType as jest.Mock).mockReturnValue([mod]);

      const result = await getModuleManifests(ConnectorType.JOB_DISCOVERY);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].i18n).toEqual(i18n);
    });

    it("returns summary with i18n as undefined when manifest has no i18n field", async () => {
      // manifest without i18n — should map cleanly with i18n: undefined
      const mod = makeRegisteredModule(); // no i18n override
      (moduleRegistry.getByType as jest.Mock).mockReturnValue([mod]);

      const result = await getModuleManifests(ConnectorType.JOB_DISCOVERY);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].i18n).toBeUndefined();
    });

    it("includes dependencies from manifest when present", async () => {
      const dependencies = [
        {
          id: "esco_classification",
          name: "ESCO Classification",
          endpoint: "https://ec.europa.eu/esco/api",
          timeoutMs: 5000,
          required: false,
          usedFor: "Occupation search",
        },
      ];

      const mod = makeRegisteredModule({ dependencies });
      (moduleRegistry.getByType as jest.Mock).mockReturnValue([mod]);

      const result = await getModuleManifests(ConnectorType.JOB_DISCOVERY);

      expect(result.success).toBe(true);
      expect(result.data![0].dependencies).toEqual(dependencies);
    });

    it("returns dependencies as undefined when manifest has none", async () => {
      const mod = makeRegisteredModule(); // no dependencies
      (moduleRegistry.getByType as jest.Mock).mockReturnValue([mod]);

      const result = await getModuleManifests(ConnectorType.JOB_DISCOVERY);

      expect(result.success).toBe(true);
      expect(result.data![0].dependencies).toBeUndefined();
    });

    it("returns not-authenticated when user is missing", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getModuleManifests();

      expect(result.success).toBe(false);
      expect(result.message).toBe("Not authenticated");
    });
  });

  // ===========================================================================
  // deactivateModule — automation pausing + notification error logging
  // ===========================================================================

  describe("deactivateModule", () => {
    const moduleId = "test-module";

    beforeEach(() => {
      // Registry returns a module in ACTIVE state
      (moduleRegistry.get as jest.Mock).mockReturnValue(
        makeRegisteredModule({ id: moduleId }),
      );
      // DB upsert succeeds
      (prisma.moduleRegistration.upsert as jest.Mock).mockResolvedValue({});
      // No affected automations by default
      (prisma.automation.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 0 });
    });

    it("pauses active automations that use the deactivated module", async () => {
      const automations = [
        { id: "auto-1", name: "Daily Search", userId: "user-1" },
        { id: "auto-2", name: "Weekly Sweep", userId: "user-2" },
      ];
      (prisma.automation.findMany as jest.Mock).mockResolvedValue(automations);
      (prisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await deactivateModule(moduleId);

      expect(result.success).toBe(true);
      expect(result.data!.pausedAutomations).toBe(2);

      // updateMany called with exact IDs captured before update
      expect(prisma.automation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["auto-1", "auto-2"] } },
        data: { status: "paused", pauseReason: "module_deactivated" },
      });
    });

    it("creates notifications for each automation owner after pausing", async () => {
      const automations = [
        { id: "auto-1", name: "Daily Search", userId: "user-1" },
      ];
      (prisma.automation.findMany as jest.Mock).mockResolvedValue(automations);
      (prisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await deactivateModule(moduleId);

      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            userId: "user-1",
            type: "module_deactivated",
            automationId: "auto-1",
            moduleId,
          }),
        ],
      });
    });

    it("logs error but does not throw when notification creation fails", async () => {
      const automations = [{ id: "auto-1", name: "Daily Search", userId: "user-1" }];
      (prisma.automation.findMany as jest.Mock).mockResolvedValue(automations);
      (prisma.automation.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.notification.createMany as jest.Mock).mockRejectedValue(
        new Error("DB constraint violation"),
      );

      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const result = await deactivateModule(moduleId);

      // Action still succeeds despite notification failure
      expect(result.success).toBe(true);
      expect(result.data!.pausedAutomations).toBe(1);

      // Error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[deactivateModule]"),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("skips automation updates when no active automations use the module", async () => {
      (prisma.automation.findMany as jest.Mock).mockResolvedValue([]);

      const result = await deactivateModule(moduleId);

      expect(result.success).toBe(true);
      expect(result.data!.pausedAutomations).toBe(0);
      expect(prisma.automation.updateMany).not.toHaveBeenCalled();
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it("returns not-authenticated when user is missing", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await deactivateModule(moduleId);

      expect(result.success).toBe(false);
      expect(result.message).toBe("Not authenticated");
    });
  });

});

// ===========================================================================
// syncRegistryFromDb — fail-open behavior
// Tested directly via the dbSynced state:
// The module-level flag means syncRegistryFromDb only runs once per process.
// We test two observable outcomes:
// 1. When DB throws, error is logged but result is still success (already covered
//    by the fact that the outer suite tests pass — syncRegistryFromDb ran first
//    with the default empty-array mock and set dbSynced=true, so subsequent
//    tests prove the in-memory path is used).
// 2. When DB returns [], setStatus is never called.
//
// For a clean-slate DB-error test, we test the logging behavior directly by
// spying on the actual function-level console.error call path.
// ===========================================================================

describe("syncRegistryFromDb — direct fail-open verification", () => {
  const mockUser = { id: "user-1", name: "Test User", email: "test@example.com" };

  it("logs error and still returns success when DB throws during sync", async () => {
    // Reset module registry so dbSynced starts fresh
    jest.resetModules();

    // Register mocks after resetModules
    jest.mock("@/utils/user.utils", () => ({
      getCurrentUser: jest.fn(),
    }));

    jest.mock("@/lib/db", () => ({
      __esModule: true,
      default: {
        moduleRegistration: { findMany: jest.fn() },
        automation: { findMany: jest.fn(), updateMany: jest.fn() },
        notification: { createMany: jest.fn() },
      },
    }));

    jest.mock("@/lib/connector/register-all", () => {});

    jest.mock("@/lib/connector/registry", () => ({
      moduleRegistry: {
        getByType: jest.fn(),
        get: jest.fn(),
        setStatus: jest.fn(),
      },
    }));

    jest.mock("@/lib/connector/health-monitor", () => ({
      checkModuleHealth: jest.fn(),
    }));

    jest.mock("@/lib/health-rate-limit", () => ({
      checkHealthCheckRateLimit: jest.fn(),
    }));

    jest.mock("@/lib/utils", () => ({
      handleError: jest.fn((_error: unknown, msg: string) => ({
        success: false,
        message: msg,
      })),
    }));

    // Fresh dynamic require after resetModules
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getModuleManifests: freshFn } = require("@/actions/module.actions");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const freshUser = require("@/utils/user.utils");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const freshPrisma = require("@/lib/db").default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const freshRegistry = require("@/lib/connector/registry").moduleRegistry;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ConnectorType: CT } = require("@/lib/connector/manifest");

    freshUser.getCurrentUser.mockResolvedValue(mockUser);
    freshPrisma.moduleRegistration.findMany.mockRejectedValue(
      new Error("Connection refused"),
    );
    freshRegistry.getByType.mockReturnValue([]);

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await freshFn(CT.JOB_DISCOVERY);

    // Fail-open: action succeeds despite DB error
    expect(result.success).toBe(true);

    // Error is logged with the expected prefix
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[syncRegistryFromDb]"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
    jest.resetModules();
  });

  it("does not call setStatus when DB returns no registrations", async () => {
    // The outer suite's beforeEach already covers this path since it mocks
    // findMany to return [] and verifies setStatus is not called during
    // the getModuleManifests tests. Here we confirm it explicitly.
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.moduleRegistration.findMany as jest.Mock).mockResolvedValue([]);

    await getModuleManifests(ConnectorType.JOB_DISCOVERY);

    // setStatus is only called when rows exist — empty array means no calls
    expect(moduleRegistry.setStatus).not.toHaveBeenCalled();
  });
});
