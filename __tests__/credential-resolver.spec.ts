// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

const mockFindUnique = jest.fn();
// update() must always return a thenable because the source calls .catch() on it
const mockUpdate = jest.fn().mockResolvedValue({});

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    apiKey: {
      findUnique: (...args: any[]) => mockFindUnique(...args),
      update: (...args: any[]) => mockUpdate(...args),
    },
  },
}));

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn(),
}));

// Mock throttle to always allow writes (so lastUsedAt tests pass deterministically)
jest.mock("@/lib/api/last-used-throttle", () => ({
  shouldWriteLastUsedAt: jest.fn(() => true),
  resetLastUsedThrottle: jest.fn(),
}));

import { resolveCredential } from "@/lib/connector/credential-resolver";
import { decrypt } from "@/lib/encryption";
import { CredentialType, type CredentialRequirement } from "@/lib/connector/manifest";

const mockDecrypt = decrypt as jest.Mock;

describe("resolveCredential", () => {
  const userId = "user-42";

  beforeEach(() => {
    jest.clearAllMocks();
    // update() must always return a thenable because the source calls .catch() on the result
    mockUpdate.mockResolvedValue({});
    // Clear env vars that might leak between tests
    delete process.env.TEST_API_KEY_FALLBACK;
  });

  afterAll(() => {
    delete process.env.TEST_API_KEY_FALLBACK;
  });

  describe("CredentialType.NONE", () => {
    it("should return defaultValue immediately without querying DB", async () => {
      const credential: CredentialRequirement = {
        type: CredentialType.NONE,
        moduleId: "eures",
        required: false,
        sensitive: false,
        defaultValue: "no-key-needed",
      };

      const result = await resolveCredential(credential, userId);

      expect(result).toBe("no-key-needed");
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("should return undefined when NONE type has no defaultValue", async () => {
      const credential: CredentialRequirement = {
        type: CredentialType.NONE,
        moduleId: "eures",
        required: false,
        sensitive: false,
      };

      const result = await resolveCredential(credential, userId);

      expect(result).toBeUndefined();
    });
  });

  describe("DB resolution", () => {
    it("should return decrypted key from DB when found with non-empty iv", async () => {
      const credential: CredentialRequirement = {
        type: CredentialType.API_KEY,
        moduleId: "openai",
        required: true,
        sensitive: true,
      };

      mockFindUnique.mockResolvedValue({
        id: "key-1",
        encryptedKey: "encrypted-data",
        iv: "base64-iv-value",
        userId,
        moduleId: "openai",
      });
      mockDecrypt.mockReturnValue("sk-real-api-key");

      const result = await resolveCredential(credential, userId);

      expect(result).toBe("sk-real-api-key");
      expect(mockDecrypt).toHaveBeenCalledWith("encrypted-data", "base64-iv-value");
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { userId_moduleId: { userId, moduleId: "openai" } },
      });
    });

    it("should return plaintext key from DB when iv is empty (non-sensitive)", async () => {
      const credential: CredentialRequirement = {
        type: CredentialType.ENDPOINT_URL,
        moduleId: "ollama",
        required: false,
        sensitive: false,
      };

      mockFindUnique.mockResolvedValue({
        id: "key-2",
        encryptedKey: "http://127.0.0.1:11434",
        iv: "",
        userId,
        moduleId: "ollama",
      });

      const result = await resolveCredential(credential, userId);

      expect(result).toBe("http://127.0.0.1:11434");
      expect(mockDecrypt).not.toHaveBeenCalled();
    });

    it("should update lastUsedAt in background when key is found", async () => {
      const credential: CredentialRequirement = {
        type: CredentialType.API_KEY,
        moduleId: "deepseek",
        required: true,
        sensitive: true,
      };

      mockFindUnique.mockResolvedValue({
        id: "key-3",
        encryptedKey: "enc-data",
        iv: "some-iv",
        userId,
        moduleId: "deepseek",
      });
      mockDecrypt.mockReturnValue("decrypted-key");
      mockUpdate.mockResolvedValue({});

      await resolveCredential(credential, userId);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "key-3" },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });

  describe("Environment variable fallback", () => {
    it("should fall back to env var when DB has no key", async () => {
      const credential: CredentialRequirement = {
        type: CredentialType.API_KEY,
        moduleId: "rapidapi",
        required: true,
        sensitive: true,
        envFallback: "TEST_API_KEY_FALLBACK",
      };

      mockFindUnique.mockResolvedValue(null);
      process.env.TEST_API_KEY_FALLBACK = "env-var-key-value";

      const result = await resolveCredential(credential, userId);

      expect(result).toBe("env-var-key-value");
    });
  });

  describe("Default value fallback", () => {
    it("should fall back to defaultValue when neither DB nor env has value", async () => {
      const credential: CredentialRequirement = {
        type: CredentialType.ENDPOINT_URL,
        moduleId: "ollama",
        required: false,
        sensitive: false,
        defaultValue: "http://127.0.0.1:11434",
      };

      mockFindUnique.mockResolvedValue(null);

      const result = await resolveCredential(credential, userId);

      expect(result).toBe("http://127.0.0.1:11434");
    });
  });

  describe("No value configured", () => {
    it("should return undefined when nothing is configured and no default", async () => {
      const credential: CredentialRequirement = {
        type: CredentialType.API_KEY,
        moduleId: "some-provider",
        required: true,
        sensitive: true,
      };

      mockFindUnique.mockResolvedValue(null);

      const result = await resolveCredential(credential, userId);

      expect(result).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    it("should fall through to env var when DB query throws", async () => {
      const credential: CredentialRequirement = {
        type: CredentialType.API_KEY,
        moduleId: "openai",
        required: true,
        sensitive: true,
        envFallback: "TEST_API_KEY_FALLBACK",
      };

      mockFindUnique.mockRejectedValue(new Error("Connection refused"));
      process.env.TEST_API_KEY_FALLBACK = "fallback-value";

      const result = await resolveCredential(credential, userId);

      expect(result).toBe("fallback-value");
    });
  });
});
