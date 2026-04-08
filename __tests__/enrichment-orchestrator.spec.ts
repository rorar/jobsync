import { EnrichmentOrchestrator } from "@/lib/connector/data-enrichment/orchestrator";
import { moduleRegistry } from "@/lib/connector/registry";
import { connectorCache } from "@/lib/connector/cache";
import { emitEvent } from "@/lib/events";
import db from "@/lib/db";
import {
  ModuleStatus,
  HealthStatus,
  CircuitBreakerState,
  ConnectorType,
  CredentialType,
} from "@/lib/connector/manifest";
import type {
  EnrichmentInput,
  EnrichmentOutput,
  FallbackChainConfig,
  DataEnrichmentConnector,
} from "@/lib/connector/data-enrichment/types";

// Mock dependencies
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    enrichmentLog: {
      create: jest.fn(),
    },
    enrichmentResult: {
      upsert: jest.fn(),
    },
  },
}));

jest.mock("@/lib/events", () => ({
  emitEvent: jest.fn(),
  createEvent: jest.fn((type: string, payload: unknown) => ({
    type,
    timestamp: new Date(),
    payload,
  })),
  DomainEventTypes: {
    EnrichmentCompleted: "EnrichmentCompleted",
    EnrichmentFailed: "EnrichmentFailed",
  },
}));

jest.mock("@/lib/connector/cache", () => {
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
  };
  return {
    connectorCache: mockCache,
    ConnectorCache: {
      buildKey: jest.fn((parts: { module: string; operation: string; params: string }) =>
        `${parts.module}:${parts.operation}:${parts.params}`,
      ),
    },
  };
});

jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: {
    get: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock("@/lib/connector/credential-resolver", () => ({
  resolveCredential: jest.fn().mockResolvedValue(undefined),
}));

const mockDb = db as unknown as {
  enrichmentLog: { create: jest.Mock };
  enrichmentResult: { upsert: jest.Mock };
};

const mockModuleRegistry = moduleRegistry as unknown as {
  get: jest.Mock;
  create: jest.Mock;
};

const mockConnectorCache = connectorCache as unknown as {
  get: jest.Mock;
  set: jest.Mock;
};

const mockEmitEvent = emitEvent as jest.Mock;

// Helper to create a mock registered module
function createMockRegistered(
  moduleId: string,
  overrides: {
    status?: ModuleStatus;
    healthStatus?: HealthStatus;
    circuitBreakerState?: CircuitBreakerState;
  } = {},
) {
  return {
    manifest: {
      id: moduleId,
      name: moduleId,
      manifestVersion: 1,
      connectorType: ConnectorType.DATA_ENRICHMENT,
      credential: { type: CredentialType.NONE, moduleId, required: false, sensitive: false },
    },
    status: overrides.status ?? ModuleStatus.ACTIVE,
    healthStatus: overrides.healthStatus ?? HealthStatus.HEALTHY,
    circuitBreakerState: overrides.circuitBreakerState ?? CircuitBreakerState.CLOSED,
    consecutiveFailures: 0,
  };
}

// Helper to create a mock connector
function createMockConnector(
  result: Partial<EnrichmentOutput> = {},
): DataEnrichmentConnector {
  return {
    enrich: jest.fn().mockResolvedValue({
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://example.com/logo.png" },
      source: "test-module",
      ttl: 86400,
      ...result,
    }),
  };
}

describe("EnrichmentOrchestrator", () => {
  let orchestrator: EnrichmentOrchestrator;

  const testInput: EnrichmentInput = {
    dimension: "logo",
    companyDomain: "example.com",
    companyName: "Example Inc",
  };

  const testChain: FallbackChainConfig = {
    dimension: "logo",
    entries: [
      { moduleId: "logo_dev", priority: 1 },
      { moduleId: "google_favicon", priority: 2 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new EnrichmentOrchestrator();
    mockConnectorCache.get.mockReturnValue(undefined);
    mockDb.enrichmentLog.create.mockResolvedValue({});
    mockDb.enrichmentResult.upsert.mockResolvedValue({ id: "result-1" });
  });

  it("returns result from first successful module", async () => {
    const connector = createMockConnector();
    mockModuleRegistry.get.mockReturnValue(createMockRegistered("logo_dev"));
    mockModuleRegistry.create.mockReturnValue(connector);

    const result = await orchestrator.execute("user-1", testInput, testChain);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("found");
    expect(result!.data).toEqual({ logoUrl: "https://example.com/logo.png" });
    // Should not call the second module
    expect(mockModuleRegistry.create).toHaveBeenCalledTimes(1);
    expect(mockModuleRegistry.create).toHaveBeenCalledWith("logo_dev", undefined);
  });

  it("falls back to second module when first fails", async () => {
    const failingConnector: DataEnrichmentConnector = {
      enrich: jest.fn().mockRejectedValue(new Error("API error")),
    };
    const successConnector = createMockConnector({
      source: "google_favicon",
      data: { logoUrl: "https://google.com/favicon.png" },
    });

    mockModuleRegistry.get.mockImplementation((id: string) => createMockRegistered(id));
    mockModuleRegistry.create.mockImplementation((id: string) => {
      if (id === "logo_dev") return failingConnector;
      return successConnector;
    });

    const result = await orchestrator.execute("user-1", testInput, testChain);

    expect(result).not.toBeNull();
    expect(result!.data).toEqual({ logoUrl: "https://google.com/favicon.png" });
    expect(mockModuleRegistry.create).toHaveBeenCalledTimes(2);
  });

  it("returns null and emits EnrichmentFailed when all modules fail", async () => {
    const failingConnector: DataEnrichmentConnector = {
      enrich: jest.fn().mockRejectedValue(new Error("API error")),
    };

    mockModuleRegistry.get.mockImplementation((id: string) => createMockRegistered(id));
    mockModuleRegistry.create.mockReturnValue(failingConnector);

    const result = await orchestrator.execute("user-1", testInput, testChain);

    expect(result).toBeNull();
    expect(mockEmitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "EnrichmentFailed",
        payload: expect.objectContaining({
          dimension: "logo",
          userId: "user-1",
        }),
      }),
    );
  });

  it("skips inactive modules", async () => {
    const successConnector = createMockConnector({ source: "google_favicon" });

    mockModuleRegistry.get.mockImplementation((id: string) => {
      if (id === "logo_dev") {
        return createMockRegistered("logo_dev", { status: ModuleStatus.INACTIVE });
      }
      return createMockRegistered(id);
    });
    mockModuleRegistry.create.mockReturnValue(successConnector);

    const result = await orchestrator.execute("user-1", testInput, testChain);

    expect(result).not.toBeNull();
    // logo_dev was skipped, only google_favicon was called
    expect(mockModuleRegistry.create).toHaveBeenCalledTimes(1);
    expect(mockModuleRegistry.create).toHaveBeenCalledWith("google_favicon", undefined);
  });

  it("skips unreachable modules", async () => {
    const successConnector = createMockConnector();

    mockModuleRegistry.get.mockImplementation((id: string) => {
      if (id === "logo_dev") {
        return createMockRegistered("logo_dev", { healthStatus: HealthStatus.UNREACHABLE });
      }
      return createMockRegistered(id);
    });
    mockModuleRegistry.create.mockReturnValue(successConnector);

    const result = await orchestrator.execute("user-1", testInput, testChain);

    expect(result).not.toBeNull();
    expect(mockModuleRegistry.create).toHaveBeenCalledTimes(1);
    expect(mockModuleRegistry.create).toHaveBeenCalledWith("google_favicon", undefined);
  });

  it("skips circuit-broken modules", async () => {
    const successConnector = createMockConnector();

    mockModuleRegistry.get.mockImplementation((id: string) => {
      if (id === "logo_dev") {
        return createMockRegistered("logo_dev", { circuitBreakerState: CircuitBreakerState.OPEN });
      }
      return createMockRegistered(id);
    });
    mockModuleRegistry.create.mockReturnValue(successConnector);

    const result = await orchestrator.execute("user-1", testInput, testChain);

    expect(result).not.toBeNull();
    expect(mockModuleRegistry.create).toHaveBeenCalledTimes(1);
    expect(mockModuleRegistry.create).toHaveBeenCalledWith("google_favicon", undefined);
  });

  it("returns cached result without chain execution", async () => {
    const cachedOutput: EnrichmentOutput = {
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://cached.com/logo.png" },
      source: "logo_dev",
      ttl: 86400,
    };
    mockConnectorCache.get.mockReturnValue(cachedOutput);

    const result = await orchestrator.execute("user-1", testInput, testChain);

    expect(result).toEqual(cachedOutput);
    // No module creation -- served from cache
    expect(mockModuleRegistry.create).not.toHaveBeenCalled();
  });

  it("emits EnrichmentCompleted event on success", async () => {
    const connector = createMockConnector();
    mockModuleRegistry.get.mockReturnValue(createMockRegistered("logo_dev"));
    mockModuleRegistry.create.mockReturnValue(connector);

    await orchestrator.execute("user-1", testInput, testChain);

    expect(mockEmitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "EnrichmentCompleted",
        payload: expect.objectContaining({
          dimension: "logo",
          moduleId: "logo_dev",
          userId: "user-1",
        }),
      }),
    );
  });

  it("caches result on success", async () => {
    const connector = createMockConnector();
    mockModuleRegistry.get.mockReturnValue(createMockRegistered("logo_dev"));
    mockModuleRegistry.create.mockReturnValue(connector);

    await orchestrator.execute("user-1", testInput, testChain);

    expect(mockConnectorCache.set).toHaveBeenCalledWith(
      expect.stringContaining("enrichment"),
      expect.objectContaining({ status: "found" }),
      expect.any(Number),
    );
  });

  it("persists result to database on success", async () => {
    const connector = createMockConnector();
    mockModuleRegistry.get.mockReturnValue(createMockRegistered("logo_dev"));
    mockModuleRegistry.create.mockReturnValue(connector);

    await orchestrator.execute("user-1", testInput, testChain);

    expect(mockDb.enrichmentResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_dimension_domainKey: {
            userId: "user-1",
            dimension: "logo",
            domainKey: "example.com",
          },
        },
      }),
    );
  });

  it("logs each attempt to database", async () => {
    const failingConnector: DataEnrichmentConnector = {
      enrich: jest.fn().mockRejectedValue(new Error("API error")),
    };
    const successConnector = createMockConnector();

    mockModuleRegistry.get.mockImplementation((id: string) => createMockRegistered(id));
    mockModuleRegistry.create.mockImplementation((id: string) => {
      if (id === "logo_dev") return failingConnector;
      return successConnector;
    });

    await orchestrator.execute("user-1", testInput, testChain);

    // Two log entries: one for failed logo_dev, one for successful google_favicon
    expect(mockDb.enrichmentLog.create).toHaveBeenCalledTimes(2);
  });

  it("handles module returning not_found and tries next", async () => {
    const notFoundConnector: DataEnrichmentConnector = {
      enrich: jest.fn().mockResolvedValue({
        dimension: "logo",
        status: "not_found",
        data: {},
        source: "logo_dev",
        ttl: 300,
      }),
    };
    const successConnector = createMockConnector();

    mockModuleRegistry.get.mockImplementation((id: string) => createMockRegistered(id));
    mockModuleRegistry.create.mockImplementation((id: string) => {
      if (id === "logo_dev") return notFoundConnector;
      return successConnector;
    });

    const result = await orchestrator.execute("user-1", testInput, testChain);

    expect(result).not.toBeNull();
    expect(result!.status).toBe("found");
    expect(mockModuleRegistry.create).toHaveBeenCalledTimes(2);
  });

  it("returns null when module is not in registry", async () => {
    mockModuleRegistry.get.mockReturnValue(undefined);

    const singleChain: FallbackChainConfig = {
      dimension: "logo",
      entries: [{ moduleId: "unknown", priority: 1 }],
    };

    const result = await orchestrator.execute("user-1", testInput, singleChain);

    expect(result).toBeNull();
    expect(mockModuleRegistry.create).not.toHaveBeenCalled();
  });

  describe("credential PUSH pattern", () => {
    it("resolves credential for API_KEY modules before creating connector", async () => {
      const { resolveCredential } = jest.requireMock("@/lib/connector/credential-resolver");
      (resolveCredential as jest.Mock).mockResolvedValue("pk_test_key_123");

      const keyModule = createMockRegistered("logo_dev", {});
      keyModule.manifest.credential = {
        type: CredentialType.API_KEY,
        moduleId: "logo_dev",
        required: false,
        sensitive: true,
      };
      mockModuleRegistry.get.mockReturnValue(keyModule);
      mockModuleRegistry.create.mockReturnValue(createMockConnector());

      const singleChain: FallbackChainConfig = {
        dimension: "logo",
        entries: [{ moduleId: "logo_dev", priority: 1 }],
      };

      await orchestrator.execute("user-1", testInput, singleChain);

      expect(resolveCredential).toHaveBeenCalledWith(keyModule.manifest.credential, "user-1");
      expect(mockModuleRegistry.create).toHaveBeenCalledWith("logo_dev", "pk_test_key_123");
    });

    it("skips credential resolution for NONE-type modules", async () => {
      const { resolveCredential } = jest.requireMock("@/lib/connector/credential-resolver");
      (resolveCredential as jest.Mock).mockClear();

      mockModuleRegistry.get.mockReturnValue(createMockRegistered("google_favicon"));
      mockModuleRegistry.create.mockReturnValue(createMockConnector());

      const singleChain: FallbackChainConfig = {
        dimension: "logo",
        entries: [{ moduleId: "google_favicon", priority: 1 }],
      };

      await orchestrator.execute("user-1", testInput, singleChain);

      expect(resolveCredential).not.toHaveBeenCalled();
      expect(mockModuleRegistry.create).toHaveBeenCalledWith("google_favicon", undefined);
    });

    it("passes undefined credential when no key is configured", async () => {
      const { resolveCredential } = jest.requireMock("@/lib/connector/credential-resolver");
      (resolveCredential as jest.Mock).mockResolvedValue(undefined);

      const keyModule = createMockRegistered("logo_dev", {});
      keyModule.manifest.credential = {
        type: CredentialType.API_KEY,
        moduleId: "logo_dev",
        required: false,
        sensitive: true,
      };
      mockModuleRegistry.get.mockReturnValue(keyModule);
      mockModuleRegistry.create.mockReturnValue(createMockConnector({ status: "not_found", data: {} }));

      const singleChain: FallbackChainConfig = {
        dimension: "logo",
        entries: [{ moduleId: "logo_dev", priority: 1 }],
      };

      await orchestrator.execute("user-1", testInput, singleChain);

      expect(mockModuleRegistry.create).toHaveBeenCalledWith("logo_dev", undefined);
    });
  });
});
