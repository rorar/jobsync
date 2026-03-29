import { moduleRegistry } from "@/lib/connector/registry";
import {
  ConnectorType,
  ModuleStatus,
  HealthStatus,
  CircuitBreakerState,
  CredentialType,
  type ModuleManifest,
} from "@/lib/connector/manifest";

// The ModuleRegistry class is not exported — only the singleton `moduleRegistry`.
// We use unique IDs per test to avoid cross-test pollution from the shared singleton.

function makeManifest(overrides: Partial<ModuleManifest> & { id: string }): ModuleManifest {
  return {
    name: overrides.name ?? `Test ${overrides.id}`,
    connectorType: overrides.connectorType ?? ConnectorType.JOB_DISCOVERY,
    credential: overrides.credential ?? {
      type: CredentialType.NONE,
      moduleId: overrides.id,
      required: false,
      sensitive: false,
    },
    ...overrides,
  };
}

describe("ModuleRegistry", () => {
  let testCounter = 0;

  function uniqueId(prefix = "test-mod"): string {
    testCounter += 1;
    return `${prefix}-${testCounter}-${Date.now()}`;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("register", () => {
    it("should store a module that can be retrieved by get()", () => {
      const id = uniqueId();
      const manifest = makeManifest({ id });
      const factory = jest.fn();

      moduleRegistry.register(manifest, factory);

      const registered = moduleRegistry.get(id);
      expect(registered).toBeDefined();
      expect(registered!.manifest).toBe(manifest);
      expect(registered!.status).toBe(ModuleStatus.ACTIVE);
      expect(registered!.healthStatus).toBe(HealthStatus.UNKNOWN);
      expect(registered!.circuitBreakerState).toBe(CircuitBreakerState.CLOSED);
      expect(registered!.consecutiveFailures).toBe(0);
    });

    it("should be idempotent — re-registration is silently ignored", () => {
      const id = uniqueId();
      const manifest1 = makeManifest({ id, name: "First" });
      const manifest2 = makeManifest({ id, name: "Second" });
      const factory1 = jest.fn();
      const factory2 = jest.fn();

      moduleRegistry.register(manifest1, factory1);
      moduleRegistry.register(manifest2, factory2);

      const registered = moduleRegistry.get(id);
      expect(registered!.manifest.name).toBe("First");
    });
  });

  describe("get", () => {
    it("should return undefined for an unknown module", () => {
      const result = moduleRegistry.get("nonexistent-module-xyz-999");
      expect(result).toBeUndefined();
    });

    it("should return the RegisteredModule for a known module", () => {
      const id = uniqueId();
      moduleRegistry.register(makeManifest({ id }), jest.fn());

      const result = moduleRegistry.get(id);
      expect(result).toBeDefined();
      expect(result!.manifest.id).toBe(id);
    });
  });

  describe("getByType", () => {
    it("should filter modules by ConnectorType correctly", () => {
      const jobId = uniqueId("job");
      const aiId = uniqueId("ai");

      moduleRegistry.register(
        makeManifest({ id: jobId, connectorType: ConnectorType.JOB_DISCOVERY }),
        jest.fn(),
      );
      moduleRegistry.register(
        makeManifest({ id: aiId, connectorType: ConnectorType.AI_PROVIDER }),
        jest.fn(),
      );

      const jobModules = moduleRegistry.getByType(ConnectorType.JOB_DISCOVERY);
      const aiModules = moduleRegistry.getByType(ConnectorType.AI_PROVIDER);

      const jobIds = jobModules.map((m) => m.manifest.id);
      const aiIds = aiModules.map((m) => m.manifest.id);

      expect(jobIds).toContain(jobId);
      expect(jobIds).not.toContain(aiId);
      expect(aiIds).toContain(aiId);
      expect(aiIds).not.toContain(jobId);
    });
  });

  describe("getActive", () => {
    it("should return only ACTIVE modules of a given type", () => {
      const activeId = uniqueId("active");
      const inactiveId = uniqueId("inactive");

      moduleRegistry.register(
        makeManifest({ id: activeId, connectorType: ConnectorType.JOB_DISCOVERY }),
        jest.fn(),
      );
      moduleRegistry.register(
        makeManifest({ id: inactiveId, connectorType: ConnectorType.JOB_DISCOVERY }),
        jest.fn(),
      );

      // Deactivate the second module
      moduleRegistry.setStatus(inactiveId, ModuleStatus.INACTIVE);

      const active = moduleRegistry.getActive(ConnectorType.JOB_DISCOVERY);
      const activeIds = active.map((m) => m.manifest.id);

      expect(activeIds).toContain(activeId);
      expect(activeIds).not.toContain(inactiveId);
    });
  });

  describe("create", () => {
    it("should call the factory and return the connector", () => {
      const id = uniqueId();
      const mockConnector = { search: jest.fn() };
      const factory = jest.fn().mockReturnValue(mockConnector);

      moduleRegistry.register(makeManifest({ id }), factory);

      const result = moduleRegistry.create(id, "arg1", "arg2");

      expect(factory).toHaveBeenCalledWith("arg1", "arg2");
      expect(result).toBe(mockConnector);
    });

    it("should throw for an unknown moduleId", () => {
      expect(() => {
        moduleRegistry.create("totally-unknown-module-id-9999");
      }).toThrow(/Unknown module/);
    });
  });

  describe("setStatus", () => {
    it("should update the module status and return true", () => {
      const id = uniqueId();
      moduleRegistry.register(makeManifest({ id }), jest.fn());

      const result = moduleRegistry.setStatus(id, ModuleStatus.INACTIVE);

      expect(result).toBe(true);
      expect(moduleRegistry.get(id)!.status).toBe(ModuleStatus.INACTIVE);
    });

    it("should set activatedAt when status is changed to ACTIVE", () => {
      const id = uniqueId();
      moduleRegistry.register(makeManifest({ id }), jest.fn());

      // First deactivate, then reactivate
      moduleRegistry.setStatus(id, ModuleStatus.INACTIVE);
      const beforeActivation = new Date();
      moduleRegistry.setStatus(id, ModuleStatus.ACTIVE);

      const registered = moduleRegistry.get(id)!;
      expect(registered.status).toBe(ModuleStatus.ACTIVE);
      expect(registered.activatedAt).toBeDefined();
      expect(registered.activatedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeActivation.getTime(),
      );
    });

    it("should return false for an unknown moduleId", () => {
      const result = moduleRegistry.setStatus("unknown-mod-xyz", ModuleStatus.ERROR);
      expect(result).toBe(false);
    });
  });

  describe("has", () => {
    it("should return true for a registered module", () => {
      const id = uniqueId();
      moduleRegistry.register(makeManifest({ id }), jest.fn());

      expect(moduleRegistry.has(id)).toBe(true);
    });

    it("should return false for an unregistered module", () => {
      expect(moduleRegistry.has("nope-not-here-12345")).toBe(false);
    });
  });

  describe("availableModules", () => {
    it("should return an array of all registered module IDs", () => {
      const id1 = uniqueId("avail1");
      const id2 = uniqueId("avail2");

      moduleRegistry.register(makeManifest({ id: id1 }), jest.fn());
      moduleRegistry.register(makeManifest({ id: id2 }), jest.fn());

      const available = moduleRegistry.availableModules();
      expect(available).toContain(id1);
      expect(available).toContain(id2);
    });

    it("should return an array (not a Map or Set)", () => {
      const available = moduleRegistry.availableModules();
      expect(Array.isArray(available)).toBe(true);
    });
  });
});
