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
});
