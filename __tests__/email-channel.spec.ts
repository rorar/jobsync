/**
 * EmailChannel Tests
 *
 * Tests: dispatch success/failure scenarios, SMTP config handling from
 * DispatchContext, rate limiting, SSRF validation, TLS enforcement.
 *
 * PERF-3: isAvailable() removed. Availability is now a boolean flag on
 * DispatchContext (emailAvailable), checked by the ChannelRouter before
 * dispatch is called. dispatch() receives a DispatchContext snapshot
 * instead of a bare userId string.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Encryption mock
// ---------------------------------------------------------------------------

jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn((_encrypted: string, _iv: string) => Promise.resolve("decrypted-password")),
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
import type { DispatchContext } from "@/lib/notifications/dispatch-context";
import { makeTestDispatchContext, makeSmtpSnapshot, makeTestNotificationDraft } from "@/lib/data/testFixtures";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = "user-email-test-1";
const SMTP_SNAPSHOT = makeSmtpSnapshot();

const NOTIFICATION = makeTestNotificationDraft({
  userId: TEST_USER_ID,
  message: "A vacancy was promoted",
  data: { jobTitle: "Developer" },
});

function makeTestContext(overrides: Partial<DispatchContext> = {}) {
  return makeTestDispatchContext({
    userId: TEST_USER_ID,
    smtp: SMTP_SNAPSHOT,
    emailAvailable: true,
    vapidSubject: "mailto:noreply@example.com",
    ...overrides,
  });
}

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
    mockValidateSmtpHost.mockReturnValue({ valid: true });
    mockSendMail.mockResolvedValue({ messageId: "msg-1" });
  });

  // -----------------------------------------------------------------------
  // dispatch()
  // -----------------------------------------------------------------------

  describe("dispatch()", () => {
    it("returns success when SMTP config exists and email sends", async () => {
      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({ success: true, channel: "email" });
      expect(mockCreateTransport).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: SMTP_SNAPSHOT.fromAddress,
          to: "user@example.com",
          subject: expect.stringContaining("[JobSync]"),
          html: expect.any(String),
          text: expect.any(String),
        }),
      );
    });

    it("returns failure when no SMTP config (smtp is null on ctx)", async () => {
      const ctx = makeTestContext({ smtp: null });
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({ success: false, channel: "email", error: "No active SMTP configuration" });
      expect(mockCreateTransport).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it("returns failure when rate limited", async () => {
      mockCheckEmailRateLimit.mockReturnValue({
        allowed: false,
        retryAfterMs: 30000,
      });

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "Rate limited",
      });
    });

    it("returns failure when SMTP host is blocked (SSRF)", async () => {
      mockValidateSmtpHost.mockReturnValue({
        valid: false,
        error: "smtp.ssrfBlocked",
      });

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "SSRF blocked: smtp.ssrfBlocked",
      });
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });

    it("passes TLS config to shared transporter factory", async () => {
      const ctx = makeTestContext();
      await channel.dispatch(NOTIFICATION, ctx);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: SMTP_SNAPSHOT.host,
          port: SMTP_SNAPSHOT.port,
          username: SMTP_SNAPSHOT.username,
          decryptedPassword: "decrypted-password",
          tlsRequired: SMTP_SNAPSHOT.tlsRequired,
        }),
      );
    });

    it("passes port 465 config to shared transporter factory", async () => {
      const ctx = makeTestContext({
        smtp: { ...SMTP_SNAPSHOT, port: 465 },
      });
      await channel.dispatch(NOTIFICATION, ctx);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
        }),
      );
    });

    it("passes non-465 port config to shared transporter factory", async () => {
      // Default fixture uses port 587
      const ctx = makeTestContext();
      await channel.dispatch(NOTIFICATION, ctx);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 587,
        }),
      );
    });

    it("returns failure when no recipient email (userEmail is null on ctx)", async () => {
      const ctx = makeTestContext({ userEmail: null });
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "No recipient email",
      });
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });

    it("returns failure when sendMail throws", async () => {
      mockSendMail.mockRejectedValue(new Error("Connection refused"));

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "Connection refused",
      });
    });

    it("returns failure when decryption fails", async () => {
      const { decrypt } = jest.requireMock("@/lib/encryption");
      decrypt.mockRejectedValueOnce(new Error("Decryption failed"));

      const ctx = makeTestContext();
      const result = await channel.dispatch(NOTIFICATION, ctx);

      expect(result).toEqual({
        success: false,
        channel: "email",
        error: "Decryption failed",
      });
    });

    it("reads locale from DispatchContext for template rendering", async () => {
      const { renderEmailTemplate } = jest.requireMock("@/lib/email/templates");
      const ctx = makeTestContext({ locale: "de" });
      await channel.dispatch(NOTIFICATION, ctx);

      expect(renderEmailTemplate).toHaveBeenCalledWith(
        NOTIFICATION.type,
        NOTIFICATION.data,
        "de",
      );
    });

    it("uses ctx.userId for rate limiting", async () => {
      const ctx = makeTestContext();
      await channel.dispatch(NOTIFICATION, ctx);

      expect(mockCheckEmailRateLimit).toHaveBeenCalledWith(TEST_USER_ID);
    });
  });
});
