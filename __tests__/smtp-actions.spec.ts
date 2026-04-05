/**
 * SMTP Server Actions Tests
 *
 * Tests: saveSmtpConfig, getSmtpConfig, testSmtpConnection, deleteSmtpConfig.
 * Covers: SSRF validation, IDOR protection (userId in all queries),
 * input validation, password encryption/masking, rate limiting.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockSmtpConfigFindFirst = jest.fn();
const mockSmtpConfigCreate = jest.fn();
const mockSmtpConfigUpdate = jest.fn();
const mockSmtpConfigDeleteMany = jest.fn();
const mockUserSettingsFindUnique = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    smtpConfig: {
      findFirst: (...args: unknown[]) => mockSmtpConfigFindFirst(...args),
      create: (...args: unknown[]) => mockSmtpConfigCreate(...args),
      update: (...args: unknown[]) => mockSmtpConfigUpdate(...args),
      deleteMany: (...args: unknown[]) => mockSmtpConfigDeleteMany(...args),
    },
    userSettings: {
      findUnique: (...args: unknown[]) => mockUserSettingsFindUnique(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Auth mock
// ---------------------------------------------------------------------------

const mockGetCurrentUser = jest.fn();

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

// ---------------------------------------------------------------------------
// Encryption mock
// ---------------------------------------------------------------------------

const mockEncrypt = jest.fn().mockReturnValue({
  encrypted: "encrypted-password",
  iv: "test-iv",
});
const mockDecrypt = jest.fn().mockReturnValue("plaintext-password");
const mockGetLast4 = jest.fn().mockReturnValue("word");

jest.mock("@/lib/encryption", () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
  getLast4: (...args: unknown[]) => mockGetLast4(...args),
}));

// ---------------------------------------------------------------------------
// SMTP validation mock
// ---------------------------------------------------------------------------

const mockValidateSmtpHost = jest.fn();

jest.mock("@/lib/smtp-validation", () => ({
  validateSmtpHost: (...args: unknown[]) => mockValidateSmtpHost(...args),
}));

// ---------------------------------------------------------------------------
// Email rate limit mock
// ---------------------------------------------------------------------------

const mockCheckTestEmailRateLimit = jest.fn();

jest.mock("@/lib/email-rate-limit", () => ({
  checkTestEmailRateLimit: (...args: unknown[]) =>
    mockCheckTestEmailRateLimit(...args),
}));

// ---------------------------------------------------------------------------
// Email templates mock
// ---------------------------------------------------------------------------

jest.mock("@/lib/email/templates", () => ({
  renderTestEmail: jest.fn(() => ({
    subject: "Test Subject",
    html: "<p>Test email</p>",
    text: "Test email",
  })),
}));

// ---------------------------------------------------------------------------
// i18n mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n/locales", () => ({
  DEFAULT_LOCALE: "en",
  isValidLocale: jest.fn((code: string) =>
    ["en", "de", "fr", "es"].includes(code),
  ),
}));

// ---------------------------------------------------------------------------
// Nodemailer mock
// ---------------------------------------------------------------------------

const mockSendMail = jest.fn().mockResolvedValue({ messageId: "msg-test-1" });
const mockClose = jest.fn();
const mockCreateTransport = jest.fn().mockReturnValue({
  sendMail: mockSendMail,
  close: mockClose,
});

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: (...args: unknown[]) => mockCreateTransport(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import {
  saveSmtpConfig,
  getSmtpConfig,
  testSmtpConnection,
  deleteSmtpConfig,
} from "@/actions/smtp.actions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER = { id: "user-smtp-test-1", name: "Test", email: "test@x.com" };

const VALID_INPUT = {
  host: "smtp.example.com",
  port: 587,
  username: "user@example.com",
  password: "my-secure-password",
  fromAddress: "noreply@example.com",
  tlsRequired: true,
  active: true,
};

const EXISTING_CONFIG = {
  id: "smtp-1",
  userId: TEST_USER.id,
  host: "smtp.example.com",
  port: 587,
  username: "user@example.com",
  password: "encrypted-password",
  iv: "test-iv",
  fromAddress: "noreply@example.com",
  tlsRequired: true,
  active: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SMTP Actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(TEST_USER);
    mockValidateSmtpHost.mockReturnValue({ valid: true });
    mockCheckTestEmailRateLimit.mockReturnValue({ allowed: true });
    mockUserSettingsFindUnique.mockResolvedValue(null);
  });

  // =========================================================================
  // saveSmtpConfig
  // =========================================================================

  describe("saveSmtpConfig()", () => {
    it("creates new config when none exists", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);
      mockSmtpConfigCreate.mockResolvedValue(EXISTING_CONFIG);

      const result = await saveSmtpConfig(VALID_INPUT);

      expect(result.success).toBe(true);
      expect(mockSmtpConfigCreate).toHaveBeenCalledTimes(1);
      expect(mockSmtpConfigCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: TEST_USER.id,
            host: VALID_INPUT.host,
            port: VALID_INPUT.port,
            password: "encrypted-password",
            iv: "test-iv",
          }),
        }),
      );
      expect(mockEncrypt).toHaveBeenCalledWith(VALID_INPUT.password);
    });

    it("updates existing config", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_CONFIG);
      mockSmtpConfigUpdate.mockResolvedValue(EXISTING_CONFIG);

      const result = await saveSmtpConfig({
        ...VALID_INPUT,
        password: "new-password",
      });

      expect(result.success).toBe(true);
      expect(mockSmtpConfigUpdate).toHaveBeenCalledTimes(1);
      expect(mockSmtpConfigUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: TEST_USER.id },
        }),
      );
    });

    it("updates existing config without changing password when omitted", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_CONFIG);
      mockSmtpConfigUpdate.mockResolvedValue(EXISTING_CONFIG);

      const result = await saveSmtpConfig({
        ...VALID_INPUT,
        password: undefined,
      });

      expect(result.success).toBe(true);
      expect(mockEncrypt).not.toHaveBeenCalled();
    });

    it("encrypts password on create", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);
      mockSmtpConfigCreate.mockResolvedValue(EXISTING_CONFIG);

      await saveSmtpConfig(VALID_INPUT);

      expect(mockEncrypt).toHaveBeenCalledWith(VALID_INPUT.password);
    });

    it("validates SSRF — blocks private IPs via validateSmtpHost", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);
      mockValidateSmtpHost.mockReturnValue({
        valid: false,
        error: "smtp.ssrfBlocked",
      });

      const result = await saveSmtpConfig({
        ...VALID_INPUT,
        host: "10.0.0.1",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.ssrfBlocked");
      expect(mockSmtpConfigCreate).not.toHaveBeenCalled();
    });

    it("rejects empty host", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await saveSmtpConfig({ ...VALID_INPUT, host: "" });

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.hostEmpty");
    });

    it("rejects invalid port", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await saveSmtpConfig({ ...VALID_INPUT, port: 99999 });

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.portInvalid");
    });

    it("rejects zero port", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await saveSmtpConfig({ ...VALID_INPUT, port: 0 });

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.portInvalid");
    });

    it("rejects empty username", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await saveSmtpConfig({ ...VALID_INPUT, username: "" });

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.usernameEmpty");
    });

    it("rejects empty password on create (new config)", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await saveSmtpConfig({ ...VALID_INPUT, password: "" });

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.passwordEmpty");
    });

    it("rejects empty fromAddress", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await saveSmtpConfig({
        ...VALID_INPUT,
        fromAddress: "",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.fromAddressEmpty");
    });

    it("rejects invalid fromAddress format", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await saveSmtpConfig({
        ...VALID_INPUT,
        fromAddress: "not-an-email",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.fromAddressInvalid");
    });

    it("IDOR protection: uses userId from session, not client input", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);
      mockSmtpConfigCreate.mockResolvedValue(EXISTING_CONFIG);

      await saveSmtpConfig(VALID_INPUT);

      // Verify findFirst checks ownership via userId
      expect(mockSmtpConfigFindFirst).toHaveBeenCalledWith({
        where: { userId: TEST_USER.id },
      });

      // Verify create uses session userId
      expect(mockSmtpConfigCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: TEST_USER.id }),
        }),
      );
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await saveSmtpConfig(VALID_INPUT);

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
      expect(mockSmtpConfigFindFirst).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getSmtpConfig
  // =========================================================================

  describe("getSmtpConfig()", () => {
    it("returns masked password (last 4 chars)", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_CONFIG);

      const result = await getSmtpConfig();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.passwordMask).toBe("****word");
      expect(mockDecrypt).toHaveBeenCalledWith(
        EXISTING_CONFIG.password,
        EXISTING_CONFIG.iv,
      );
      expect(mockGetLast4).toHaveBeenCalled();
    });

    it("returns null when no config exists", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await getSmtpConfig();

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it("IDOR protection: queries by userId from session", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      await getSmtpConfig();

      expect(mockSmtpConfigFindFirst).toHaveBeenCalledWith({
        where: { userId: TEST_USER.id },
      });
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await getSmtpConfig();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
    });

    it("returns generic mask when decryption fails", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_CONFIG);
      mockDecrypt.mockImplementationOnce(() => {
        throw new Error("Decryption failed");
      });

      const result = await getSmtpConfig();

      expect(result.success).toBe(true);
      expect(result.data!.passwordMask).toBe("****");
    });

    it("does not expose raw password in DTO", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_CONFIG);

      const result = await getSmtpConfig();

      expect(result.data).not.toHaveProperty("password");
      expect(result.data).not.toHaveProperty("iv");
      expect(result.data).toHaveProperty("passwordMask");
    });
  });

  // =========================================================================
  // testSmtpConnection
  // =========================================================================

  describe("testSmtpConnection()", () => {
    beforeEach(() => {
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_CONFIG);
      mockDecrypt.mockReturnValue("decrypted-password");
    });

    it("sends test email to fromAddress", async () => {
      await testSmtpConnection();

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: EXISTING_CONFIG.fromAddress,
          to: EXISTING_CONFIG.fromAddress,
          subject: expect.stringContaining("[JobSync]"),
        }),
      );
    });

    it("rate limits: 1 per 60 seconds", async () => {
      mockCheckTestEmailRateLimit.mockReturnValue({
        allowed: false,
        retryAfterMs: 45000,
      });

      const result = await testSmtpConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.testRateLimited");
      expect(mockSmtpConfigFindFirst).not.toHaveBeenCalled();
    });

    it("validates SSRF on dispatch (re-validation)", async () => {
      mockValidateSmtpHost.mockReturnValue({
        valid: false,
        error: "smtp.ssrfBlocked",
      });

      const result = await testSmtpConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.ssrfBlocked");
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });

    it("returns failure when no active config", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await testSmtpConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.notConfigured");
    });

    it("returns failure when decryption fails", async () => {
      mockDecrypt.mockImplementationOnce(() => {
        throw new Error("Decryption error");
      });

      const result = await testSmtpConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.connectionFailed");
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await testSmtpConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
    });

    it("closes transporter after sending", async () => {
      await testSmtpConnection();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it("closes transporter even when sendMail throws", async () => {
      mockSendMail.mockRejectedValueOnce(new Error("SMTP error"));

      await testSmtpConnection();

      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it("creates transporter with TLS enforcement from config", async () => {
      await testSmtpConnection();

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: EXISTING_CONFIG.host,
          port: EXISTING_CONFIG.port,
          requireTLS: EXISTING_CONFIG.tlsRequired,
          tls: expect.objectContaining({
            rejectUnauthorized: true,
            minVersion: "TLSv1.2",
          }),
        }),
      );
    });
  });

  // =========================================================================
  // deleteSmtpConfig
  // =========================================================================

  describe("deleteSmtpConfig()", () => {
    it("deletes existing config", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_CONFIG);
      mockSmtpConfigDeleteMany.mockResolvedValue({ count: 1 });

      const result = await deleteSmtpConfig();

      expect(result.success).toBe(true);
      expect(mockSmtpConfigDeleteMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER.id },
      });
    });

    it("IDOR protection: uses userId in both findFirst and deleteMany", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(EXISTING_CONFIG);
      mockSmtpConfigDeleteMany.mockResolvedValue({ count: 1 });

      await deleteSmtpConfig();

      expect(mockSmtpConfigFindFirst).toHaveBeenCalledWith({
        where: { userId: TEST_USER.id },
      });
      expect(mockSmtpConfigDeleteMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER.id },
      });
    });

    it("returns NOT_FOUND when no config exists", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await deleteSmtpConfig();

      expect(result.success).toBe(false);
      expect(result.message).toBe("smtp.notConfigured");
      expect(mockSmtpConfigDeleteMany).not.toHaveBeenCalled();
    });

    it("returns unauthorized when not authenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const result = await deleteSmtpConfig();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.unauthorized");
      expect(mockSmtpConfigFindFirst).not.toHaveBeenCalled();
    });
  });
});
