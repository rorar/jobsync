/**
 * Retention Policies — Cron job for data lifecycle rules.
 *
 * 7 rules that purge or archive stale data according to RETENTION_CONFIG.
 * Schedule: daily at 03:30 UTC.
 *
 * Architecture:
 * - Same globalThis singleton pattern as crm-cron.ts (survives HMR)
 * - Promise.allSettled: one failing rule does not block the others
 * - Structured JSON log per rule result
 */

import "server-only";
import cron, { type ScheduledTask } from "node-cron";
import { mkdir, appendFile, readdir, unlink, stat } from "fs/promises";
import { join } from "path";
import prisma from "@/lib/db";
import { runRetentionCleanup } from "@/lib/vacancy-pipeline/retention.service";
import { RETENTION_CONFIG } from "./retention-config";

// globalThis guard: survives Next.js HMR module reloads (same pattern as crm-cron)
const RETENTION_CRON_KEY = "__retentionCronTask";
const RETENTION_CRON_RUNNING_KEY = "__retentionCronRunning";

function getRetentionTask(): ScheduledTask | null {
  return (globalThis as Record<string, unknown>)[RETENTION_CRON_KEY] as ScheduledTask | null ?? null;
}
function setRetentionTask(task: ScheduledTask | null): void {
  (globalThis as Record<string, unknown>)[RETENTION_CRON_KEY] = task;
}
function getIsRunning(): boolean {
  return ((globalThis as Record<string, unknown>)[RETENTION_CRON_RUNNING_KEY] as boolean) ?? false;
}
function setIsRunning(v: boolean): void {
  (globalThis as Record<string, unknown>)[RETENTION_CRON_RUNNING_KEY] = v;
}

const RETENTION_CRON_EXPRESSION = "30 3 * * *"; // Daily at 03:30 UTC

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function logRule(rule: string, deletedCount: number, cutoffDate: Date | null): void {
  console.log(
    JSON.stringify({
      kind: "retention-sweep",
      ts: new Date().toISOString(),
      rule,
      deletedCount,
      cutoffDate: cutoffDate?.toISOString() ?? null,
    }),
  );
}

// ---------------------------------------------------------------------------
// Rule 1: purgeOldNotifications
// ---------------------------------------------------------------------------

async function purgeOldNotifications(): Promise<number> {
  const cutoff = daysAgo(RETENTION_CONFIG.notificationRetentionDays);
  const result = await prisma.notification.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  logRule("purgeOldNotifications", result.count, cutoff);
  return result.count;
}

// ---------------------------------------------------------------------------
// Rule 2: purgeExpiredEnrichmentResults
// ---------------------------------------------------------------------------

async function purgeExpiredEnrichmentResults(): Promise<number> {
  const now = new Date();
  const result = await prisma.enrichmentResult.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  logRule("purgeExpiredEnrichmentResults", result.count, now);
  return result.count;
}

// ---------------------------------------------------------------------------
// Rule 3: purgeOldEnrichmentLogs
// ---------------------------------------------------------------------------

async function purgeOldEnrichmentLogs(): Promise<number> {
  const cutoff = daysAgo(RETENTION_CONFIG.enrichmentLogRetentionDays);
  const result = await prisma.enrichmentLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  logRule("purgeOldEnrichmentLogs", result.count, cutoff);
  return result.count;
}

// ---------------------------------------------------------------------------
// Rule 4: purgeOldStagedVacancies
// ---------------------------------------------------------------------------

async function purgeOldStagedVacancies(): Promise<number> {
  // Query distinct userIds that have staged vacancies
  const users = await prisma.stagedVacancy.findMany({
    select: { userId: true },
    distinct: ["userId"],
  });

  let totalPurged = 0;
  for (const { userId } of users) {
    try {
      const result = await runRetentionCleanup(
        userId,
        RETENTION_CONFIG.stagedVacancyRetentionDays,
      );
      totalPurged += result.purgedCount;
    } catch (error) {
      console.error(
        JSON.stringify({
          kind: "retention-sweep",
          ts: new Date().toISOString(),
          rule: "purgeOldStagedVacancies",
          error: error instanceof Error ? error.message : String(error),
          userId,
        }),
      );
    }
  }

  logRule(
    "purgeOldStagedVacancies",
    totalPurged,
    daysAgo(RETENTION_CONFIG.stagedVacancyRetentionDays),
  );
  return totalPurged;
}

// ---------------------------------------------------------------------------
// Rule 5: archiveAndPurgeOldAdminAuditLogs
// ---------------------------------------------------------------------------

const AUDIT_ARCHIVE_DIR = "/data/audit-archive";

async function archiveAndPurgeOldAdminAuditLogs(): Promise<number> {
  const cutoff = daysAgo(RETENTION_CONFIG.adminAuditLogRetentionDays);

  // Fetch records to archive before deletion
  const records = await prisma.adminAuditLog.findMany({
    where: { timestamp: { lt: cutoff } },
  });

  if (records.length === 0) {
    logRule("archiveAndPurgeOldAdminAuditLogs", 0, cutoff);
    return 0;
  }

  // Ensure archive directory exists
  await mkdir(AUDIT_ARCHIVE_DIR, { recursive: true });

  // Group records by YYYY-MM for file partitioning
  const byMonth = new Map<string, typeof records>();
  for (const record of records) {
    const key = `${record.timestamp.getFullYear()}-${String(record.timestamp.getMonth() + 1).padStart(2, "0")}`;
    const group = byMonth.get(key);
    if (group) {
      group.push(record);
    } else {
      byMonth.set(key, [record]);
    }
  }

  // Append to JSONL files
  for (const [month, monthRecords] of byMonth) {
    const filePath = join(AUDIT_ARCHIVE_DIR, `${month}.jsonl`);
    const lines = monthRecords
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n";
    await appendFile(filePath, lines, "utf-8");
  }

  // Delete archived records from DB
  const result = await prisma.adminAuditLog.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });

  logRule("archiveAndPurgeOldAdminAuditLogs", result.count, cutoff);
  return result.count;
}

// ---------------------------------------------------------------------------
// Rule 6: purgeOldCrmActivityLogs
// ---------------------------------------------------------------------------

async function purgeOldCrmActivityLogs(): Promise<number> {
  const cutoff = daysAgo(RETENTION_CONFIG.crmActivityLogRetentionDays);
  const result = await prisma.crmActivityLog.deleteMany({
    where: { happenedAt: { lt: cutoff } },
  });
  logRule("purgeOldCrmActivityLogs", result.count, cutoff);
  return result.count;
}

// ---------------------------------------------------------------------------
// Rule 7: cleanOrphanedLogoAssetFiles
// ---------------------------------------------------------------------------

const LOGOS_DIR = "/data/logos";

async function cleanOrphanedLogoAssetFiles(): Promise<number> {
  // Collect all filePaths currently tracked in DB
  const dbAssets = await prisma.logoAsset.findMany({
    select: { filePath: true },
  });
  const knownPaths = new Set(dbAssets.map((a) => a.filePath));

  let deletedCount = 0;

  // Gracefully handle missing logos directory
  let userDirs: string[];
  try {
    userDirs = await readdir(LOGOS_DIR);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      logRule("cleanOrphanedLogoAssetFiles", 0, daysAgo(RETENTION_CONFIG.logoAssetOrphanGraceDays));
      return 0;
    }
    throw error;
  }

  const graceCutoff = daysAgo(RETENTION_CONFIG.logoAssetOrphanGraceDays);

  for (const userDir of userDirs) {
    const userPath = join(LOGOS_DIR, userDir);

    let companyDirs: string[];
    try {
      companyDirs = await readdir(userPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }

    for (const companyDir of companyDirs) {
      const companyPath = join(userPath, companyDir);

      let files: string[];
      try {
        files = await readdir(companyPath);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }

      for (const file of files) {
        const filePath = join(companyPath, file);

        // Check if this file is tracked in the DB
        if (knownPaths.has(filePath)) continue;

        // Grace period: only delete files older than the grace days
        try {
          const fileStat = await stat(filePath);
          if (fileStat.mtime > graceCutoff) continue;

          await unlink(filePath);
          deletedCount++;
        } catch (error: unknown) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw error;
        }
      }
    }
  }

  logRule("cleanOrphanedLogoAssetFiles", deletedCount, graceCutoff);
  return deletedCount;
}

// ---------------------------------------------------------------------------
// Main cron loop
// ---------------------------------------------------------------------------

async function runRetentionRules(): Promise<void> {
  // Prevent overlapping cycles (globalThis-backed guard)
  if (getIsRunning()) {
    console.log(
      JSON.stringify({
        kind: "retention-sweep",
        ts: new Date().toISOString(),
        rule: "_cycle",
        message: "Previous cycle still running, skipping.",
      }),
    );
    return;
  }
  setIsRunning(true);

  try {
    // Promise.allSettled: one failing rule must not block the others
    const results = await Promise.allSettled([
      purgeOldNotifications(),
      purgeExpiredEnrichmentResults(),
      purgeOldEnrichmentLogs(),
      purgeOldStagedVacancies(),
      archiveAndPurgeOldAdminAuditLogs(),
      purgeOldCrmActivityLogs(),
      cleanOrphanedLogoAssetFiles(),
    ]);

    // Log individual rule failures
    const ruleLabels = [
      "purgeOldNotifications",
      "purgeExpiredEnrichmentResults",
      "purgeOldEnrichmentLogs",
      "purgeOldStagedVacancies",
      "archiveAndPurgeOldAdminAuditLogs",
      "purgeOldCrmActivityLogs",
      "cleanOrphanedLogoAssetFiles",
    ];
    for (const [i, label] of ruleLabels.entries()) {
      if (results[i].status === "rejected") {
        console.error(
          JSON.stringify({
            kind: "retention-sweep",
            ts: new Date().toISOString(),
            rule: label,
            error: (results[i] as PromiseRejectedResult).reason?.message ??
              String((results[i] as PromiseRejectedResult).reason),
          }),
        );
      }
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        kind: "retention-sweep",
        ts: new Date().toISOString(),
        rule: "_cycle",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  } finally {
    setIsRunning(false);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startRetentionCron(): void {
  if (getRetentionTask()) {
    console.log("[Retention-Cron] Already running");
    return;
  }

  if (!cron.validate(RETENTION_CRON_EXPRESSION)) {
    console.error(`[Retention-Cron] Invalid cron expression: ${RETENTION_CRON_EXPRESSION}`);
    return;
  }

  console.log(`[Retention-Cron] Starting with schedule: ${RETENTION_CRON_EXPRESSION}`);

  const task = cron.schedule(RETENTION_CRON_EXPRESSION, runRetentionRules, {
    timezone: process.env.TZ || "UTC",
  });
  setRetentionTask(task);

  console.log("[Retention-Cron] Started successfully");
}

export function stopRetentionCron(): void {
  const task = getRetentionTask();
  if (task) {
    task.stop();
    setRetentionTask(null);
    console.log("[Retention-Cron] Stopped");
  }
}

// Exported for testing
export {
  purgeOldNotifications,
  purgeExpiredEnrichmentResults,
  purgeOldEnrichmentLogs,
  purgeOldStagedVacancies,
  archiveAndPurgeOldAdminAuditLogs,
  purgeOldCrmActivityLogs,
  cleanOrphanedLogoAssetFiles,
  runRetentionRules,
};
