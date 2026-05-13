/**
 * Retention Cron Tests
 *
 * Tests: 7 retention rule functions are exported and callable,
 * Prisma calls use correct filters and date math,
 * RETENTION_CONFIG values match specification.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// Mock node-cron (imported by retention-cron.ts at module level)
jest.mock("node-cron", () => ({
  __esModule: true,
  default: {
    schedule: jest.fn(),
    validate: jest.fn().mockReturnValue(true),
  },
}));

// Mock fs/promises (used by archiveAndPurgeOldAdminAuditLogs + cleanOrphanedLogoAssetFiles)
jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  appendFile: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  unlink: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ mtime: new Date(0) }),
}));

// Mock runRetentionCleanup (used by purgeOldStagedVacancies)
jest.mock("@/lib/vacancy-pipeline/retention.service", () => ({
  runRetentionCleanup: jest.fn().mockResolvedValue({ purgedCount: 0, hashesCreated: 0 }),
}));

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockNotificationDeleteMany = jest.fn();
const mockEnrichmentResultDeleteMany = jest.fn();
const mockEnrichmentLogDeleteMany = jest.fn();
const mockCrmActivityLogDeleteMany = jest.fn();
const mockAdminAuditLogFindMany = jest.fn();
const mockAdminAuditLogDeleteMany = jest.fn();
const mockStagedVacancyFindMany = jest.fn();
const mockLogoAssetFindMany = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    notification: {
      deleteMany: (...args: unknown[]) => mockNotificationDeleteMany(...args),
    },
    enrichmentResult: {
      deleteMany: (...args: unknown[]) => mockEnrichmentResultDeleteMany(...args),
    },
    enrichmentLog: {
      deleteMany: (...args: unknown[]) => mockEnrichmentLogDeleteMany(...args),
    },
    crmActivityLog: {
      deleteMany: (...args: unknown[]) => mockCrmActivityLogDeleteMany(...args),
    },
    adminAuditLog: {
      findMany: (...args: unknown[]) => mockAdminAuditLogFindMany(...args),
      deleteMany: (...args: unknown[]) => mockAdminAuditLogDeleteMany(...args),
    },
    stagedVacancy: {
      findMany: (...args: unknown[]) => mockStagedVacancyFindMany(...args),
    },
    logoAsset: {
      findMany: (...args: unknown[]) => mockLogoAssetFindMany(...args),
    },
  },
}));

// Import after mocks
import {
  purgeOldNotifications,
  purgeExpiredEnrichmentResults,
  purgeOldEnrichmentLogs,
  purgeOldStagedVacancies,
  archiveAndPurgeOldAdminAuditLogs,
  purgeOldCrmActivityLogs,
  cleanOrphanedLogoAssetFiles,
} from "@/lib/scheduler/retention-cron";
import { RETENTION_CONFIG } from "@/lib/scheduler/retention-config";

/** Replicate the same daysAgo logic as retention-cron.ts */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

describe("Retention Cron", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Defaults: deleteMany returns count 0
    mockNotificationDeleteMany.mockResolvedValue({ count: 0 });
    mockEnrichmentResultDeleteMany.mockResolvedValue({ count: 0 });
    mockEnrichmentLogDeleteMany.mockResolvedValue({ count: 0 });
    mockCrmActivityLogDeleteMany.mockResolvedValue({ count: 0 });
    mockAdminAuditLogFindMany.mockResolvedValue([]);
    mockAdminAuditLogDeleteMany.mockResolvedValue({ count: 0 });
    mockStagedVacancyFindMany.mockResolvedValue([]);
    mockLogoAssetFindMany.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // All 7 rule functions are exported and callable
  // -------------------------------------------------------------------------

  describe("exports", () => {
    it("exports all 7 rule functions", () => {
      expect(typeof purgeOldNotifications).toBe("function");
      expect(typeof purgeExpiredEnrichmentResults).toBe("function");
      expect(typeof purgeOldEnrichmentLogs).toBe("function");
      expect(typeof purgeOldStagedVacancies).toBe("function");
      expect(typeof archiveAndPurgeOldAdminAuditLogs).toBe("function");
      expect(typeof purgeOldCrmActivityLogs).toBe("function");
      expect(typeof cleanOrphanedLogoAssetFiles).toBe("function");
    });
  });

  // -------------------------------------------------------------------------
  // RETENTION_CONFIG values
  // -------------------------------------------------------------------------

  describe("RETENTION_CONFIG", () => {
    it("has correct retention period values", () => {
      expect(RETENTION_CONFIG.notificationRetentionDays).toBe(30);
      expect(RETENTION_CONFIG.enrichmentLogRetentionDays).toBe(90);
      expect(RETENTION_CONFIG.stagedVacancyRetentionDays).toBe(30);
      expect(RETENTION_CONFIG.adminAuditLogRetentionDays).toBe(365);
      expect(RETENTION_CONFIG.crmActivityLogRetentionDays).toBe(1095);
      expect(RETENTION_CONFIG.logoAssetOrphanGraceDays).toBe(7);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 1: purgeOldNotifications
  // -------------------------------------------------------------------------

  describe("purgeOldNotifications", () => {
    it("calls prisma.notification.deleteMany with createdAt < cutoff date", async () => {
      mockNotificationDeleteMany.mockResolvedValue({ count: 5 });

      const result = await purgeOldNotifications();

      expect(result).toBe(5);
      expect(mockNotificationDeleteMany).toHaveBeenCalledTimes(1);

      const callArg = mockNotificationDeleteMany.mock.calls[0][0];
      expect(callArg.where.createdAt.lt).toBeInstanceOf(Date);

      // The cutoff should be ~30 days ago (using same setDate logic as implementation)
      const cutoff = callArg.where.createdAt.lt as Date;
      const expected = daysAgo(30);
      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(5000);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 2: purgeExpiredEnrichmentResults
  // -------------------------------------------------------------------------

  describe("purgeExpiredEnrichmentResults", () => {
    it("calls prisma.enrichmentResult.deleteMany with expiresAt < now", async () => {
      mockEnrichmentResultDeleteMany.mockResolvedValue({ count: 3 });

      const before = new Date();
      const result = await purgeExpiredEnrichmentResults();
      const after = new Date();

      expect(result).toBe(3);
      expect(mockEnrichmentResultDeleteMany).toHaveBeenCalledTimes(1);

      const callArg = mockEnrichmentResultDeleteMany.mock.calls[0][0];
      expect(callArg.where.expiresAt.lt).toBeInstanceOf(Date);

      // The cutoff should be approximately "now"
      const cutoff = callArg.where.expiresAt.lt as Date;
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // Rule 3: purgeOldEnrichmentLogs
  // -------------------------------------------------------------------------

  describe("purgeOldEnrichmentLogs", () => {
    it("calls prisma.enrichmentLog.deleteMany with createdAt < cutoff date (90 days)", async () => {
      mockEnrichmentLogDeleteMany.mockResolvedValue({ count: 12 });

      const result = await purgeOldEnrichmentLogs();

      expect(result).toBe(12);
      expect(mockEnrichmentLogDeleteMany).toHaveBeenCalledTimes(1);

      const callArg = mockEnrichmentLogDeleteMany.mock.calls[0][0];
      expect(callArg.where.createdAt.lt).toBeInstanceOf(Date);

      // The cutoff should be ~90 days ago (using same setDate logic as implementation)
      const cutoff = callArg.where.createdAt.lt as Date;
      const expected = daysAgo(90);
      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(5000);
    });
  });

  // -------------------------------------------------------------------------
  // Rule 5: archiveAndPurgeOldAdminAuditLogs
  // -------------------------------------------------------------------------

  describe("archiveAndPurgeOldAdminAuditLogs", () => {
    it("returns 0 when no records to archive", async () => {
      mockAdminAuditLogFindMany.mockResolvedValue([]);

      const result = await archiveAndPurgeOldAdminAuditLogs();

      expect(result).toBe(0);
      expect(mockAdminAuditLogDeleteMany).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Rule 6: purgeOldCrmActivityLogs
  // -------------------------------------------------------------------------

  describe("purgeOldCrmActivityLogs", () => {
    it("calls prisma.crmActivityLog.deleteMany with happenedAt < cutoff date (1095 days)", async () => {
      mockCrmActivityLogDeleteMany.mockResolvedValue({ count: 7 });

      const result = await purgeOldCrmActivityLogs();

      expect(result).toBe(7);
      expect(mockCrmActivityLogDeleteMany).toHaveBeenCalledTimes(1);

      const callArg = mockCrmActivityLogDeleteMany.mock.calls[0][0];
      expect(callArg.where.happenedAt.lt).toBeInstanceOf(Date);

      // The cutoff should be ~1095 days ago (using same setDate logic as implementation)
      const cutoff = callArg.where.happenedAt.lt as Date;
      const expected = daysAgo(1095);
      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(5000);
    });
  });
});
