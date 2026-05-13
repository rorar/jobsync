/**
 * Tests for account deletion lifecycle (GDPR Art. 17).
 * Covers: requestAccountDeletion routing, executeAccountDeletion ordering,
 * cancelAccountDeletion, getDeletionStatus, F-1 audit, F-2 email, F-4 cooling-off.
 */

// Mock server-only (required for execute-deletion.ts, privacy-helpers.ts)
jest.mock("server-only", () => ({}));

// Mock auth
const mockGetCurrentUser = jest.fn();
jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock privacy helpers
const mockGetPrivacySettings = jest.fn();
jest.mock("@/lib/account/privacy-helpers", () => ({
  getPrivacySettingsForUser: (...args: unknown[]) => mockGetPrivacySettings(...args),
}));

// Mock execute-deletion
const mockExecuteDeletion = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/account/execute-deletion", () => ({
  executeAccountDeletion: (...args: unknown[]) => mockExecuteDeletion(...args),
}));

// Mock admin audit log
const mockWriteAuditLog = jest.fn();
jest.mock("@/lib/auth/admin", () => ({
  writeAdminAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}));

// Mock encryption
jest.mock("@/lib/encryption", () => ({
  decrypt: jest.fn().mockResolvedValue("decrypted-password"),
}));

// Mock SMTP validation
jest.mock("@/lib/smtp-validation", () => ({
  validateSmtpHost: jest.fn().mockReturnValue({ valid: true }),
}));

// Mock email transport
let mockSendMail: jest.Mock = jest.fn().mockResolvedValue({});
jest.mock("@/lib/email/transport", () => ({
  createSmtpTransporter: jest.fn().mockImplementation(() => ({
    sendMail: (...args: unknown[]) => mockSendMail(...args),
    close: jest.fn(),
  })),
}));

// Mock email templates
jest.mock("@/lib/email/templates", () => ({
  renderDeletionConfirmationEmail: jest.fn().mockReturnValue({
    subject: "Confirm Deletion",
    html: "<p>Confirm</p>",
    text: "Confirm",
  }),
}));

// Mock locale resolver
jest.mock("@/lib/locale-resolver", () => ({
  resolveUserLocale: jest.fn().mockResolvedValue("en"),
}));

// Mock deletion token
jest.mock("@/lib/account/deletion-token", () => ({
  generateDeletionToken: jest.fn().mockReturnValue({
    raw: "del_abc123",
    hash: "hashed_token",
    expiresAt: new Date(Date.now() + 86400000),
  }),
}));

// Mock Prisma
const mockUserUpdate = jest.fn().mockResolvedValue({});
const mockUserFindFirst = jest.fn();
const mockSmtpFindUnique = jest.fn();
const mockTokenUpsert = jest.fn().mockResolvedValue({});
const mockTokenDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
    },
    smtpConfig: {
      findUnique: (...args: unknown[]) => mockSmtpFindUnique(...args),
    },
    deletionConfirmationToken: {
      upsert: (...args: unknown[]) => mockTokenUpsert(...args),
      deleteMany: (...args: unknown[]) => mockTokenDeleteMany(...args),
    },
    $transaction: jest.fn().mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops);
      }
      // Function-based transaction — not used by requestAccountDeletion
      return ops;
    }),
  },
}));

// Mock fs
jest.mock("fs", () => ({
  promises: {
    unlink: jest.fn().mockResolvedValue(undefined),
    rm: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  deleteAccount,
  requestAccountDeletion,
  cancelAccountDeletion,
  getDeletionStatus,
} from "@/actions/account.actions";
import { defaultPrivacySettings } from "@/models/userSettings.model";

describe("deleteAccount / requestAccountDeletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: immediate deletion (no email, no cooling-off, audit ON)
    mockGetPrivacySettings.mockResolvedValue(defaultPrivacySettings);
    mockSmtpFindUnique.mockResolvedValue(null);
  });

  it("returns error when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await deleteAccount();
    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("executes immediate deletion with default settings", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    const result = await requestAccountDeletion();
    expect(result.success).toBe(true);
    expect(result.data?.deleted).toBe(true);
    expect(mockExecuteDeletion).toHaveBeenCalledWith("user-1");
  });

  it("writes audit log when auditAccountDeletion is true (F-1)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    mockGetPrivacySettings.mockResolvedValue({
      ...defaultPrivacySettings,
      auditAccountDeletion: true,
    });

    await requestAccountDeletion();

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ action: "account_deletion_requested" }),
      expect.anything(),
    );
  });

  it("skips audit log when auditAccountDeletion is false", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    mockGetPrivacySettings.mockResolvedValue({
      ...defaultPrivacySettings,
      auditAccountDeletion: false,
    });

    await requestAccountDeletion();

    expect(mockWriteAuditLog).not.toHaveBeenCalled();
  });

  it("schedules deletion with cooling-off period (F-4)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    mockGetPrivacySettings.mockResolvedValue({
      ...defaultPrivacySettings,
      coolingOffDays: 30,
    });

    const result = await requestAccountDeletion();

    expect(result.success).toBe(true);
    expect(result.data?.scheduledAt).toBeDefined();
    expect(result.data?.deleted).toBeUndefined();
    expect(mockExecuteDeletion).not.toHaveBeenCalled();
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ deletionScheduledAt: expect.any(Date) }),
      }),
    );
  });

  it("sends confirmation email when email confirmation enabled + SMTP configured (F-2)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    mockGetPrivacySettings.mockResolvedValue({
      ...defaultPrivacySettings,
      emailConfirmationBeforeDeletion: true,
    });
    mockSmtpFindUnique.mockResolvedValue({
      id: "smtp-1",
      userId: "user-1",
      host: "smtp.example.com",
      port: 587,
      username: "user",
      password: "encrypted",
      iv: "test-iv",
      fromAddress: "noreply@example.com",
      tlsRequired: true,
      active: true,
    });

    const result = await requestAccountDeletion();

    expect(result.success).toBe(true);
    expect(result.data?.pendingConfirmation).toBe(true);
    expect(mockExecuteDeletion).not.toHaveBeenCalled();
    expect(mockTokenUpsert).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalled();
  });

  it("falls back to immediate when email confirmation ON but no SMTP", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    mockGetPrivacySettings.mockResolvedValue({
      ...defaultPrivacySettings,
      emailConfirmationBeforeDeletion: true,
    });
    mockSmtpFindUnique.mockResolvedValue(null); // No SMTP

    const result = await requestAccountDeletion();

    expect(result.success).toBe(true);
    expect(result.data?.deleted).toBe(true);
    expect(mockExecuteDeletion).toHaveBeenCalledWith("user-1");
  });

  it("deleteAccount() delegates to requestAccountDeletion()", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });

    const result = await deleteAccount();
    expect(result.success).toBe(true);
    expect(result.data?.deleted).toBe(true);
  });
});

describe("cancelAccountDeletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await cancelAccountDeletion();
    expect(result.success).toBe(false);
  });

  it("returns error when no deletion scheduled", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    mockUserFindFirst.mockResolvedValue({ deletionScheduledAt: null });

    const result = await cancelAccountDeletion();
    expect(result.success).toBe(false);
  });

  it("clears deletionScheduledAt and pending tokens", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    mockUserFindFirst.mockResolvedValue({
      deletionScheduledAt: new Date("2026-06-14"),
    });

    const prisma = require("@/lib/db").default;
    const result = await cancelAccountDeletion();

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe("getDeletionStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null scheduledAt when no deletion pending", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    mockUserFindFirst.mockResolvedValue({ deletionScheduledAt: null });

    const result = await getDeletionStatus();
    expect(result.success).toBe(true);
    expect(result.data?.scheduledAt).toBeNull();
  });

  it("returns ISO date when deletion scheduled", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    const date = new Date("2026-06-14T00:00:00Z");
    mockUserFindFirst.mockResolvedValue({ deletionScheduledAt: date });

    const result = await getDeletionStatus();
    expect(result.success).toBe(true);
    expect(result.data?.scheduledAt).toBe(date.toISOString());
  });
});
