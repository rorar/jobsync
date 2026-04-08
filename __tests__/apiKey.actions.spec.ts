import {
  getOllamaBaseUrl,
  getUserApiKeys,
  saveApiKey,
  deleteApiKey,
  getEnvApiKeyStatus,
  getDefaultOllamaBaseUrl,
} from "@/actions/apiKey.actions";
import { getCurrentUser } from "@/utils/user.utils";

jest.mock("@/lib/db", () => {
  const mockApiKey = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  };
  // Return the mock as both default and named export so both
  // `import db from "@/lib/db"` and `require("@/lib/db")` work.
  return { __esModule: true, default: { apiKey: mockApiKey }, apiKey: mockApiKey };
});

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/utils", () => ({
  handleError: jest.fn((_error: unknown, msg: string) => ({
    success: false,
    message: msg,
  })),
}));

jest.mock("@/lib/encryption", () => ({
  encrypt: jest.fn((key: string) => ({ encrypted: `enc-${key}`, iv: "iv-1" })),
  getLast4: jest.fn((key: string) => key.slice(-4)),
  decrypt: jest.fn(
    (encrypted: string) => `decrypted-${encrypted}`,
  ),
}));

// Mock moduleRegistry used by saveApiKey and getEnvApiKeyStatus
const mockGetByType = jest.fn().mockReturnValue([]);
const mockGetByCredentialModuleId = jest.fn().mockReturnValue(null);

jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: {
    getByType: (...args: unknown[]) => mockGetByType(...args),
    getByCredentialModuleId: (...args: unknown[]) =>
      mockGetByCredentialModuleId(...args),
  },
}));

// Mock register-all (side-effect import that registers all modules)
jest.mock("@/lib/connector/register-all", () => ({}));

const db = require("@/lib/db");
const mockApiKey = db.apiKey;

describe("getOllamaBaseUrl", () => {
  const originalEnv = process.env.OLLAMA_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OLLAMA_BASE_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OLLAMA_BASE_URL = originalEnv;
    } else {
      delete process.env.OLLAMA_BASE_URL;
    }
  });

  it("returns stored plaintext URL when valid", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.apiKey.findUnique.mockResolvedValue({
      encryptedKey: "http://my-ollama:11434",
      iv: "",
    });

    const result = await getOllamaBaseUrl();
    expect(result).toBe("http://my-ollama:11434");
  });

  it("falls back when stored URL has invalid protocol", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.apiKey.findUnique.mockResolvedValue({
      encryptedKey: "ftp://malicious-server",
      iv: "",
    });

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const result = await getOllamaBaseUrl();

    expect(result).toBe("http://127.0.0.1:11434");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Security] Stored Ollama URL failed validation, using fallback",
    );
    consoleSpy.mockRestore();
  });

  it("falls back when stored URL has credentials", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.apiKey.findUnique.mockResolvedValue({
      encryptedKey: "http://admin:pass@internal:11434",
      iv: "",
    });

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const result = await getOllamaBaseUrl();

    expect(result).toBe("http://127.0.0.1:11434");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Security] Stored Ollama URL failed validation, using fallback",
    );
    consoleSpy.mockRestore();
  });

  it("uses OLLAMA_BASE_URL env var as fallback", async () => {
    process.env.OLLAMA_BASE_URL = "http://env-ollama:11434";
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.apiKey.findUnique.mockResolvedValue({
      encryptedKey: "file:///etc/passwd",
      iv: "",
    });

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const result = await getOllamaBaseUrl();

    expect(result).toBe("http://env-ollama:11434");
    consoleSpy.mockRestore();
  });

  it("returns default when no user is authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const result = await getOllamaBaseUrl();
    expect(result).toBe("http://127.0.0.1:11434");
  });

  it("returns default when no API key is stored", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.apiKey.findUnique.mockResolvedValue(null);
    const result = await getOllamaBaseUrl();
    expect(result).toBe("http://127.0.0.1:11434");
  });

  it("returns default on database error", async () => {
    (getCurrentUser as jest.Mock).mockRejectedValue(new Error("DB down"));
    const result = await getOllamaBaseUrl();
    expect(result).toBe("http://127.0.0.1:11434");
  });
});

// ---------------------------------------------------------------------------
// getUserApiKeys
// ---------------------------------------------------------------------------

describe("getUserApiKeys", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty array when no keys are stored", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockApiKey.findMany.mockResolvedValue([]);

    const result = await getUserApiKeys();
    expect(result).toEqual({ success: true, data: [] });
  });

  it("returns failure when user is not authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await getUserApiKeys();
    expect(result).toEqual({ success: false, message: "Not authenticated" });
  });

  it("returns masked keys for sensitive entries (non-empty iv)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockApiKey.findMany.mockResolvedValue([
      {
        id: "key-1",
        moduleId: "openai",
        last4: "abcd",
        iv: "some-iv",
        encryptedKey: "enc-data",
        label: null,
        createdAt: new Date("2026-01-01"),
        lastUsedAt: null,
      },
    ]);

    const result = await getUserApiKeys();
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    // Sensitive keys should NOT have displayValue
    expect(result.data![0]).not.toHaveProperty("displayValue");
    expect(result.data![0].last4).toBe("abcd");
  });

  it("returns displayValue for non-sensitive entries (empty iv)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockApiKey.findMany.mockResolvedValue([
      {
        id: "key-2",
        moduleId: "ollama",
        last4: "11434",
        iv: "",
        encryptedKey: "http://127.0.0.1:11434",
        label: null,
        createdAt: new Date("2026-01-01"),
        lastUsedAt: null,
      },
    ]);

    const result = await getUserApiKeys();
    expect(result.success).toBe(true);
    expect(result.data![0].displayValue).toBe("http://127.0.0.1:11434");
  });
});

// ---------------------------------------------------------------------------
// deleteApiKey
// ---------------------------------------------------------------------------

describe("deleteApiKey", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deletes key by moduleId and userId", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockApiKey.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteApiKey("openai");
    expect(result).toEqual({ success: true });
    expect(mockApiKey.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", moduleId: "openai" },
    });
  });

  it("returns failure when user is not authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await deleteApiKey("openai");
    expect(result).toEqual({ success: false, message: "Not authenticated" });
  });
});

// ---------------------------------------------------------------------------
// saveApiKey
// ---------------------------------------------------------------------------

describe("saveApiKey", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("encrypts sensitive keys and upserts with correct data", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockGetByCredentialModuleId.mockReturnValue({
      manifest: { credential: { sensitive: true } },
    });
    mockApiKey.upsert.mockResolvedValue({
      id: "key-1",
      moduleId: "openai",
      last4: "test",
      label: null,
      createdAt: new Date("2026-01-01"),
      lastUsedAt: null,
    });

    const result = await saveApiKey({
      moduleId: "openai",
      key: "sk-test-key-abcd",
    });

    expect(result.success).toBe(true);
    expect(mockApiKey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_moduleId: { userId: "user-1", moduleId: "openai" },
        },
        create: expect.objectContaining({
          userId: "user-1",
          moduleId: "openai",
          encryptedKey: "enc-sk-test-key-abcd",
          iv: "iv-1",
          last4: "abcd",
        }),
      }),
    );
  });

  it("stores non-sensitive keys as plaintext (empty iv)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockGetByCredentialModuleId.mockReturnValue({
      manifest: { credential: { sensitive: false } },
    });
    mockApiKey.upsert.mockResolvedValue({
      id: "key-2",
      moduleId: "ollama",
      last4: "http://127.0.0.1:11434",
      label: null,
      createdAt: new Date("2026-01-01"),
      lastUsedAt: null,
    });

    const result = await saveApiKey({
      moduleId: "ollama",
      key: "http://127.0.0.1:11434",
    });

    expect(result.success).toBe(true);
    expect(mockApiKey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          encryptedKey: "http://127.0.0.1:11434",
          iv: "",
          last4: "http://127.0.0.1:11434",
        }),
      }),
    );
    // Non-sensitive: response should include displayValue
    expect(result.data?.displayValue).toBe("http://127.0.0.1:11434");
  });

  it("returns failure when user is not authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await saveApiKey({
      moduleId: "openai",
      key: "sk-test",
    });

    expect(result).toEqual({ success: false, message: "Not authenticated" });
  });

  it("treats unknown modules as sensitive (fail-safe)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    // Module not found in registry
    mockGetByCredentialModuleId.mockReturnValue(null);
    mockApiKey.upsert.mockResolvedValue({
      id: "key-3",
      moduleId: "openai",
      last4: "efgh",
      label: null,
      createdAt: new Date("2026-01-01"),
      lastUsedAt: null,
    });

    await saveApiKey({ moduleId: "openai", key: "sk-unknown-efgh" });

    // Should use encrypt (sensitive=true fallback)
    expect(mockApiKey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          encryptedKey: "enc-sk-unknown-efgh",
          iv: "iv-1",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// getDefaultOllamaBaseUrl
// ---------------------------------------------------------------------------

describe("getDefaultOllamaBaseUrl", () => {
  const originalEnv = process.env.OLLAMA_BASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OLLAMA_BASE_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OLLAMA_BASE_URL = originalEnv;
    } else {
      delete process.env.OLLAMA_BASE_URL;
    }
  });

  it("returns env var when set", async () => {
    process.env.OLLAMA_BASE_URL = "http://custom:11434";
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });

    const result = await getDefaultOllamaBaseUrl();
    expect(result).toBe("http://custom:11434");
  });

  it("returns default when env var not set", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });

    const result = await getDefaultOllamaBaseUrl();
    expect(result).toBe("http://127.0.0.1:11434");
  });

  it("returns default when no user authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await getDefaultOllamaBaseUrl();
    expect(result).toBe("http://127.0.0.1:11434");
  });
});

// ---------------------------------------------------------------------------
// getEnvApiKeyStatus
// ---------------------------------------------------------------------------

describe("getEnvApiKeyStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns failure when user is not authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await getEnvApiKeyStatus();
    expect(result).toEqual({ success: false, message: "Not authenticated" });
  });

  it("returns empty map when no modules have envFallback", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockGetByType.mockReturnValue([
      {
        manifest: {
          credential: { type: "api_key", moduleId: "openai" },
        },
      },
    ]);

    const result = await getEnvApiKeyStatus();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it("returns true for modules whose envFallback var is set", async () => {
    process.env.RAPIDAPI_KEY = "some-key";
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockGetByType.mockReturnValue([
      {
        manifest: {
          credential: {
            type: "api_key",
            moduleId: "rapidapi",
            envFallback: "RAPIDAPI_KEY",
          },
        },
      },
    ]);

    const result = await getEnvApiKeyStatus();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ rapidapi: true });

    delete process.env.RAPIDAPI_KEY;
  });

  it("returns false for modules whose envFallback var is not set", async () => {
    delete process.env.RAPIDAPI_KEY;
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockGetByType.mockReturnValue([
      {
        manifest: {
          credential: {
            type: "api_key",
            moduleId: "rapidapi",
            envFallback: "RAPIDAPI_KEY",
          },
        },
      },
    ]);

    const result = await getEnvApiKeyStatus();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ rapidapi: false });
  });

  it("skips modules with credential type 'none'", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    mockGetByType.mockReturnValue([
      {
        manifest: {
          credential: { type: "none", moduleId: "esco", envFallback: "ESCO_KEY" },
        },
      },
    ]);

    const result = await getEnvApiKeyStatus();
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });
});
