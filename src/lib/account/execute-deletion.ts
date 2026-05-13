import "server-only";

/**
 * Execute Account Deletion — extracted server-only deletion logic.
 *
 * Accepts raw userId (no session required) — called by:
 *   - requestAccountDeletion() (server action, after session check)
 *   - confirm-deletion API route (token-based auth, no session)
 *   - purgeExpiredDeletions() cron rule (no session)
 *
 * ADR-019: NOT a server action export. Lives in a "server-only" file.
 */

import prisma from "@/lib/db";
import { promises as fs } from "fs";
import path from "path";

const LOGO_BASE_DIR = process.env.LOGO_STORAGE_PATH || "/data/logos";

/**
 * Delete all data for a given user. Transaction-safe with best-effort
 * disk cleanup afterwards.
 *
 * Phase 0: Collect file paths BEFORE deleting DB rows.
 * Phase 1: Transaction — delete all user data in dependency-safe order.
 * Phase 2: Best-effort disk cleanup (after DB commit succeeds).
 */
export async function executeAccountDeletion(userId: string): Promise<void> {
  // Phase 0: Collect file paths BEFORE deleting DB rows
  const [logoAssets, resumeFiles] = await Promise.all([
    prisma.logoAsset.findMany({
      where: { userId },
      select: { filePath: true },
    }),
    prisma.file.findMany({
      where: { Resume: { profile: { userId } } },
      select: { filePath: true },
    }),
  ]);

  // Phase 1: Delete all user data in dependency-safe order
  // Cross-model Restrict FKs require deleting dependents before parents.
  await prisma.$transaction(async (tx) => {
    // --- Delete pending deletion confirmation token ---
    await tx.deletionConfirmationToken.deleteMany({
      where: { userId },
    });

    // --- Resume deep chain (WorkExperience -> Company/JobTitle/Location via implicit FK) ---
    await tx.workExperience.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId } } } },
    });
    await tx.education.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId } } } },
    });
    await tx.licenseOrCertification.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId } } } },
    });
    await tx.otherSection.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId } } } },
    });
    await tx.contactInfo.deleteMany({
      where: { resume: { profile: { userId } } },
    });

    // Summary (orphan-prone -- FK is ON ResumeSection side)
    const sections = await tx.resumeSection.findMany({
      where: { Resume: { profile: { userId } } },
      select: { summaryId: true },
    });
    const summaryIds = sections
      .map((s) => s.summaryId)
      .filter((id): id is string => id !== null);

    await tx.resumeSection.deleteMany({
      where: { Resume: { profile: { userId } } },
    });
    if (summaryIds.length > 0) {
      await tx.summary.deleteMany({ where: { id: { in: summaryIds } } });
    }

    // File records (orphan-prone -- FK is ON Resume side)
    await tx.file.deleteMany({
      where: { Resume: { profile: { userId } } },
    });

    // --- Automation -> Resume (Restrict FK) -- must delete BEFORE resumes ---
    await tx.automation.deleteMany({ where: { userId } });

    await tx.resume.deleteMany({
      where: { profile: { userId } },
    });

    // --- Activity -> ActivityType (implicit FK) ---
    await tx.activity.deleteMany({ where: { userId } });

    // --- CRM targets (reference CrmTask/CrmNote + Person/Company/Job) ---
    await tx.crmTaskTarget.deleteMany({ where: { task: { userId } } });
    await tx.crmNoteTarget.deleteMany({ where: { note: { userId } } });

    // --- Legacy models without userId ---
    await tx.contact.deleteMany({ where: { createdBy: userId } });
    await tx.interview.deleteMany({ where: { job: { userId } } });

    // --- Job (references JobTitle/Company via implicit Restrict FK) ---
    // Must delete before User cascade attempts to delete JobTitle/Company,
    // otherwise Restrict on Job.jobTitleId/companyId would block.
    await tx.job.deleteMany({ where: { userId } });

    // --- Delete User (cascades all remaining direct FK relations) ---
    await tx.user.delete({ where: { id: userId } });
  });

  // Phase 2: Best-effort disk cleanup (after DB commit succeeds)
  const allPaths = [
    ...logoAssets.map((a) => a.filePath).filter(Boolean),
    ...resumeFiles.map((f) => f.filePath),
  ];

  await Promise.allSettled(
    allPaths.map((p) => fs.unlink(p as string).catch(() => {})),
  );

  // Clean up user's logo directory
  try {
    await fs.rm(path.join(LOGO_BASE_DIR, userId), {
      recursive: true,
      force: true,
    });
  } catch {
    // Best-effort -- never throw on file cleanup errors
  }
}
