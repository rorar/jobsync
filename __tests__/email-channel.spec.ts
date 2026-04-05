/**
 * EmailChannel Tests
 *
 * Tests: dispatch success/failure scenarios, SMTP config handling,
 * rate limiting, SSRF validation, TLS enforcement, isAvailable checks.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockSmtpConfigFindFirst = jest.fn();
const mockSmtpConfigCount = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    smtpConfig: {
      findFirst: (...args: unknown[]) => mockSmtpConfigFindFirst(...args),
      count: (...args: unknown[]) => mockSmtpConfigCount(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Encryption mock
// ---------------------------------------------------------------------------

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((_encrypted: string, _iv: string) => "decrypted-password"),
}));

// ---------------------------------------------------------------------------
// Email rate limit mock
// ---------------------------------------------------------------------------

const mockCheckEmailRateLimit = jest.fn();

jest.mock("@/lib/email-rate-limit", () => ({
  checkEmailRateLimit: (...args: unknown[]) => mockCheckEmailRateLimit(...args),
}));

// ---------------------------------------------------------------------------
// SMTP validation mock
// ---------------------------------------------------------------------------

const mockValidateSmtpHost = jest.fn();

jest.mock("@/lib/smtp-validation", () => ({
  validateSmtpHost: (...args: unknown[]) => mockValidateSmtpHost(...args),
}));

// ---------------------------------------------------------------------------
// Email templates mock
// ---------------------------------------------------------------------------

jest.mock("@/lib/email/templates", () => ({
  renderEmailTemplate: jest.fn(() => ({
    subject: "Test Subject",
    html: "<p>Test HTML</p>",
    text: "Test plain text",
  })),
}));

// ---------------------------------------------------------------------------
// Locale resolver mock
// ---------------------------------------------------------------------------

jest.mock("@/lib/locale-resolver", () => ({
  resolveUserLocale: jest.fn().mockResolvedValue("en"),
}));

// ---------------------------------------------------------------------------
// Nodemailer mock
// ---------------------------------------------------------------------------

const mockSendMail = jest.fn().mockResolvedValue({ messageId: "msg-1" });
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
// Transport factory mock (uses mocked nodemailer internally)
// ---------------------------------------------------------------------------

jest.mock("@/lib/email/transport", () => ({
  createSmtpTransporter: (...args: unknown[]) => mockCreateTransport(...args),
}));

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import { EmailChannel } from "@/lib/notifications/channels/email.channel";
import type { NotificationDraft } from "@/lib/notifications/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-email-test-1";

const SMTP_CONFIG = {
  id: "smtp-1",
  userId: TEST_USER_ID,
  host: "smtp.example.com",
  port: 587,
  username: "user@example.com",
  password: "encrypted-password",
  iv: "test-iv",
  fromAddress: "noreply@example.com",
  active: true,
  tlsRequired: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const NOTIFICATION: NotificationDraft = {
  userId: TEST_USER_ID,
  type: "vacancy_promoted",
  message: "A vacancy was promoted",
  data: { jobTitle: "Developer" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EmailChannel", () => {
  let channel: EmailChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    channel = new EmailChannel();

    // Default happy-path mocks
    mockCheckEmailRateLimit.mockReturnValue({ allowed: true });
    mockSmtpConfigFindFirst.mockResolvedValue(SMTP_CONFIG);
    mockValidateSmtpHost.mockReturnValue({ valid: true });
    mockUserFindUnique.mockResolvedValue({ email: "user@example.com" });
    mockSendMail.mockResolvedValue({ messageId: "msg-1" });
  });

  // -----------------------------------------------------------------------
  // dispatch()
  // -----------------------------------------------------------------------

  describe("dispatch()", () => {
    it("returns success when SMTP config exists and email sends", async () => {
      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({ success: true, channel: "email" });
      expect(mockCreateTransport).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: SMTP_CONFIG.fromAddress,
          to: "user@example.com",
          subject: expect.stringContaining("[JobSync]"),
          html: expect.any(String),
          text: expect.any(String),
        }),
      );
    });

    it("returns failure when no SMTP config", async () => {
      mockSmtpConfigFindFirst.mockResolvedValue(null);

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({ success: false, channel: "email", error: "No active SMTP configuration" });
      expect(mockCreateTransport).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it("returns failure when rate limited", async () => {
      mockCheckEmailRateLimit.mockReturnValue({
        allowed: false,
        retryAfterMs: 30000,
      });

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "Rate limited",
      });
      expect(mockSmtpConfigFindFirst).not.toHaveBeenCalled();
    });

    it("returns failure when SMTP host is blocked (SSRF)", async () => {
      mockValidateSmtpHost.mockReturnValue({
        valid: false,
        error: "smtp.ssrfBlocked",
      });

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "SSRF blocked: smtp.ssrfBlocked",
      });
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });

    it("passes TLS config to shared transporter factory", async () => {
      await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: SMTP_CONFIG.host,
          port: SMTP_CONFIG.port,
          username: SMTP_CONFIG.username,
          decryptedPassword: "decrypted-password",
          tlsRequired: SMTP_CONFIG.tlsRequired,
        }),
      );
    });

    it("passes port 465 config to shared transporter factory", async () => {
      const config465 = { ...SMTP_CONFIG, port: 465 };
      mockSmtpConfigFindFirst.mockResolvedValue(config465);

      await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
        }),
      );
    });

    it("passes non-465 port config to shared transporter factory", async () => {
      // Default fixture uses port 587
      await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 587,
        }),
      );
    });

    it("returns failure when no recipient email", async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "No recipient email",
      });
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });

    it("returns failure when sendMail throws", async () => {
      mockSendMail.mockRejectedValue(new Error("Connection refused"));

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "Connection refused",
      });
    });

    it("returns failure when decryption fails", async () => {
      const { decrypt } = jest.requireMock("@/lib/encryption");
      decrypt.mockImplementationOnce(() => {
        throw new Error("Decryption failed");
      });

      const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "Decryption failed",
      });
    });
  });

  // -----------------------------------------------------------------------
  // isAvailable()
  // -----------------------------------------------------------------------

  describe("isAvailable()", () => {
    it("returns true when active SmtpConfig exists", async () => {
      mockSmtpConfigCount.mockResolvedValue(1);

      const available = await channel.isAvailable(TEST_USER_ID);

      expect(available).toBe(true);
      expect(mockSmtpConfigCount).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID, active: true },
      });
    });

    it("returns false when no SmtpConfig", async () => {
      mockSmtpConfigCount.mockResolvedValue(0);

      const available = await channel.isAvailable(TEST_USER_ID);

      expect(available).toBe(false);
    });

    it("returns false when SmtpConfig is inactive", async () => {
      // count with active: true returns 0 for inactive configs
      mockSmtpConfigCount.mockResolvedValue(0);

      const available = await channel.isAvailable(TEST_USER_ID);

      expect(available).toBe(false);
    });
  });
});
