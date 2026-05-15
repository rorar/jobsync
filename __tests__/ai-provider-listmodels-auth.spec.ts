/**
 * AI Provider listModels Auth Detection Tests (BS-G2b-1)
 *
 * Verifies that OpenAI and DeepSeek listModels() return auth_failed
 * (not unavailable) on 401/403 responses.
 */

jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: jest.fn(() => jest.fn((name: string) => ({ modelId: name }))),
}));

jest.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: jest.fn(() => jest.fn((name: string) => ({ modelId: name }))),
}));

jest.mock("@/lib/api-key-resolver", () => ({
  resolveApiKey: jest.fn().mockResolvedValue("test-api-key"),
}));

// Mock moduleRegistry to prevent self-registration side effects
jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: {
    register: jest.fn(),
    get: jest.fn(),
  },
}));

import { createOpenAIConnector } from "@/lib/connector/ai-provider/modules/openai";
import { createDeepSeekConnector } from "@/lib/connector/ai-provider/modules/deepseek";

describe("OpenAI listModels auth detection", () => {
  const connector = createOpenAIConnector();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns auth_failed on 401", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }) as jest.Mock;

    const result = await connector.listModels("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("auth_failed");
      expect(result.error).toHaveProperty("message");
    }
  });

  it("returns auth_failed on 403", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    }) as jest.Mock;

    const result = await connector.listModels("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("auth_failed");
    }
  });

  it("returns unavailable on 500 (not auth)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }) as jest.Mock;

    const result = await connector.listModels("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("unavailable");
    }
  });

  it("returns model list on 200", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        data: [{ id: "gpt-4o" }, { id: "gpt-3.5-turbo" }],
      }),
    }) as jest.Mock;

    const result = await connector.listModels("user-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(["gpt-4o", "gpt-3.5-turbo"]);
    }
  });

  // LM-1: null API key path
  it("returns auth_failed when API key is not configured", async () => {
    const { resolveApiKey } = jest.requireMock("@/lib/api-key-resolver");
    (resolveApiKey as jest.Mock).mockResolvedValueOnce(null);
    const result = await connector.listModels("user-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("auth_failed");
    }
  });

  // LM-2: 429 behavior (falls through to unavailable, no rate_limited branch)
  it("returns unavailable on 429 (listModels has no rate_limited branch)", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests" }) as jest.Mock;
    const result = await connector.listModels("user-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("unavailable");
  });

  // LM-3: Network error
  it("returns network error when fetch throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as jest.Mock;
    const result = await connector.listModels("user-1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("network");
    }
  });

  // LM-4: Empty data response
  it("returns empty array when response has no data field", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: jest.fn().mockResolvedValue({}),
    }) as jest.Mock;
    const result = await connector.listModels("user-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });
});

describe("DeepSeek listModels auth detection", () => {
  const connector = createDeepSeekConnector();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns auth_failed on 401", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }) as jest.Mock;

    const result = await connector.listModels("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("auth_failed");
      expect(result.error).toHaveProperty("message");
    }
  });

  it("returns auth_failed on 403", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    }) as jest.Mock;

    const result = await connector.listModels("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("auth_failed");
    }
  });

  it("returns unavailable on 500 (not auth)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }) as jest.Mock;

    const result = await connector.listModels("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("unavailable");
    }
  });

  it("returns model list on 200", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        data: [{ id: "deepseek-chat" }, { id: "deepseek-coder" }],
      }),
    }) as jest.Mock;

    const result = await connector.listModels("user-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(["deepseek-chat", "deepseek-coder"]);
    }
  });

  // LM-1: null API key
  it("returns auth_failed when API key is not configured", async () => {
    const { resolveApiKey } = jest.requireMock("@/lib/api-key-resolver");
    (resolveApiKey as jest.Mock).mockResolvedValueOnce(null);
    const result = await connector.listModels("user-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("auth_failed");
  });

  // LM-2: 429
  it("returns unavailable on 429", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests" }) as jest.Mock;
    const result = await connector.listModels("user-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("unavailable");
  });

  // LM-3: Network error
  it("returns network error when fetch throws", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as jest.Mock;
    const result = await connector.listModels("user-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("network");
  });

  // LM-4: Empty data
  it("returns empty array when response has no data field", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: jest.fn().mockResolvedValue({}),
    }) as jest.Mock;
    const result = await connector.listModels("user-1");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });
});
