import {
  buildResiliencePolicy,
  ConnectorApiError,
  type ResiliencePolicy,
} from "@/lib/connector/resilience";
import type { ResilienceConfig } from "@/lib/connector/manifest";

// Mock global fetch for resilientFetch tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("Resilience", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper to create a ResilienceConfig.
   * NOTE: cockatiel's wrap() requires at least one policy, so the "minimal"
   * config still enables a timeout to avoid the empty-wrap crash.
   */
  function makeFullConfig(overrides: Partial<ResilienceConfig> = {}): ResilienceConfig {
    return {
      retryAttempts: 3,
      retryBackoff: "exponential",
      circuitBreaker: true,
      circuitBreakerThreshold: 5,
      circuitBreakerCooldownMs: 30000,
      timeoutMs: 15000,
      maxConcurrent: 5,
      rateLimitTokens: 3,
      rateLimitRefillMs: 500,
      ...overrides,
    };
  }

  function makeMinimalConfig(overrides: Partial<ResilienceConfig> = {}): ResilienceConfig {
    return {
      retryAttempts: 0,
      retryBackoff: "none",
      circuitBreaker: false,
      circuitBreakerThreshold: 5,
      circuitBreakerCooldownMs: 30000,
      timeoutMs: 10000, // At least one policy to avoid empty wrap() crash
      ...overrides,
    };
  }

  describe("buildResiliencePolicy", () => {
    it("should build a policy from config with all features enabled", () => {
      const config = makeFullConfig();

      const policy = buildResiliencePolicy(config);

      expect(policy).toBeDefined();
      expect(typeof policy.execute).toBe("function");
      expect(typeof policy.resilientFetch).toBe("function");
      expect(policy.rateLimiter).toBeDefined();
    });

    it("should build a policy with only timeout enabled", () => {
      const config = makeMinimalConfig();

      const policy = buildResiliencePolicy(config);

      expect(policy).toBeDefined();
      expect(typeof policy.execute).toBe("function");
      expect(typeof policy.resilientFetch).toBe("function");
      expect(policy.rateLimiter).toBeUndefined();
    });

    it("should create a rate limiter when rateLimitTokens is configured", () => {
      const config = makeMinimalConfig({
        rateLimitTokens: 10,
        rateLimitRefillMs: 1000,
      });

      const policy = buildResiliencePolicy(config);

      expect(policy.rateLimiter).toBeDefined();
    });

    it("should NOT create a rate limiter when rateLimitTokens is not configured", () => {
      const config = makeMinimalConfig({
        rateLimitTokens: undefined,
        rateLimitRefillMs: undefined,
      });

      const policy = buildResiliencePolicy(config);

      expect(policy.rateLimiter).toBeUndefined();
    });

    it("should accept a custom error class", () => {
      class CustomError extends Error {
        constructor(
          public readonly status: number,
          message: string,
        ) {
          super(message);
        }
      }

      const config = makeFullConfig();
      const policy = buildResiliencePolicy(config, CustomError);

      expect(policy).toBeDefined();
    });
  });

  describe("resilientFetch", () => {
    it("should succeed on 200 response", async () => {
      const config = makeMinimalConfig();
      const policy = buildResiliencePolicy(config);

      const mockResponseData = { results: [1, 2, 3] };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: jest.fn().mockResolvedValue(mockResponseData),
      });

      const result = await policy.resilientFetch(
        "https://api.example.com/data",
        { method: "GET" },
        "TestModule",
      );

      expect(result).toEqual(mockResponseData);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should throw ConnectorApiError on non-ok response", async () => {
      const config = makeMinimalConfig();
      const policy = buildResiliencePolicy(config);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: jest.fn(),
      });

      await expect(
        policy.resilientFetch(
          "https://api.example.com/data",
          { method: "GET" },
          "TestModule",
        ),
      ).rejects.toThrow(ConnectorApiError);
    });

    it("should include module name and status in error message", async () => {
      const config = makeMinimalConfig();
      const policy = buildResiliencePolicy(config);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        json: jest.fn(),
      });

      await expect(
        policy.resilientFetch(
          "https://api.example.com/data",
          { method: "GET" },
          "TestModule",
        ),
      ).rejects.toThrow(/TestModule API error: 403/);
    });

    it("should use 'API' as default module name when not provided", async () => {
      const config = makeMinimalConfig();
      const policy = buildResiliencePolicy(config);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: jest.fn(),
      });

      await expect(
        policy.resilientFetch("https://api.example.com/data", { method: "GET" }),
      ).rejects.toThrow(/API API error: 500/);
    });

    it("should pass abort signal from policy to fetch", async () => {
      const config = makeMinimalConfig();
      const policy = buildResiliencePolicy(config);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({}),
      });

      await policy.resilientFetch(
        "https://api.example.com/data",
        { method: "POST", body: "{}" },
        "Test",
      );

      // fetch should receive a signal from the cockatiel policy
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1]).toHaveProperty("signal");
    });
  });

  describe("execute", () => {
    it("should execute a function through the policy", async () => {
      const config = makeMinimalConfig();
      const policy = buildResiliencePolicy(config);

      const result = await policy.execute(async () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it("should propagate errors from the executed function", async () => {
      const config = makeMinimalConfig();
      const policy = buildResiliencePolicy(config);

      await expect(
        policy.execute(async () => {
          throw new Error("Something went wrong");
        }),
      ).rejects.toThrow("Something went wrong");
    });
  });

  describe("ConnectorApiError", () => {
    it("should store status code and message", () => {
      const error = new ConnectorApiError(429, "Rate limited");

      expect(error.status).toBe(429);
      expect(error.message).toBe("Rate limited");
      expect(error).toBeInstanceOf(Error);
    });

    it("should be an instance of Error", () => {
      const error = new ConnectorApiError(500, "Server error");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("Error");
    });
  });
});
