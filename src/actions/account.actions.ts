"use server";

import { getCurrentUser } from "@/utils/user.utils";
import prisma from "@/lib/db";
import type { ActionResult } from "@/models/actionResult";
import { promises as fs } from "fs";
import path from "path";

const LOGO_BASE_DIR = process.env.LOGO_STORAGE_PATH || "/data/logos";

export async function deleteAccount(): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, message: "errors.notAuthenticated" };
  }

  const uid = user.id;

  // Phase 0: Collect file paths BEFORE deleting DB rows
  const [logoAssets, resumeFiles] = await Promise.all([
    prisma.logoAsset.findMany({
      where: { userId: uid },
      select: { filePath: true },
    }),
    prisma.file.findMany({
      where: { Resume: { profile: { userId: uid } } },
      select: { filePath: true },
    }),
  ]);

  // Phase 1: Delete all user data in dependency-safe order
  // Cross-model Restrict FKs require deleting dependents before parents.
  await prisma.$transaction(async (tx) => {
    // --- Resume deep chain (WorkExperience → Company/JobTitle/Location via implicit FK) ---
    await tx.workExperience.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId: uid } } } },
    });
    await tx.education.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId: uid } } } },
    });
    await tx.licenseOrCertification.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId: uid } } } },
    });
    await tx.otherSection.deleteMany({
      where: { ResumeSection: { Resume: { profile: { userId: uid } } } },
    });
    await tx.contactInfo.deleteMany({
      where: { resume: { profile: { userId: uid } } },
    });

    // Summary (orphan-prone — FK is ON ResumeSection side)
    const sections = await tx.resumeSection.findMany({
      where: { Resume: { profile: { userId: uid } } },
      select: { summaryId: true },
    });
    const summaryIds = sections
      .map((s) => s.summaryId)
      .filter((id): id is string => id !== null);

    await tx.resumeSection.deleteMany({
      where: { Resume: { profile: { userId: uid } } },
    });
    if (summaryIds.length > 0) {
      await tx.summary.deleteMany({ where: { id: { in: summaryIds } } });
    }

    // File records (orphan-prone — FK is ON Resume side)
    await tx.file.deleteMany({
      where: { Resume: { profile: { userId: uid } } },
    });

    // --- Automation → Resume (Restrict FK) — must delete BEFORE resumes ---
    await tx.automation.deleteMany({ where: { userId: uid } });

    await tx.resume.deleteMany({
      where: { profile: { userId: uid } },
    });

    // --- Activity → ActivityType (implicit FK) ---
    await tx.activity.deleteMany({ where: { userId: uid } });

    // --- CRM targets (reference CrmTask/CrmNote + Person/Company/Job) ---
    await tx.crmTaskTarget.deleteMany({ where: { task: { userId: uid } } });
    await tx.crmNoteTarget.deleteMany({ where: { note: { userId: uid } } });

    // --- Legacy models without userId ---
    await tx.contact.deleteMany({ where: { createdBy: uid } });
    await tx.interview.deleteMany({ where: { job: { userId: uid } } });

    // --- Job (references JobTitle/Company via implicit Restrict FK) ---
    // Must delete before User cascade attempts to delete JobTitle/Company,
    // otherwise Restrict on Job.jobTitleId/companyId would block.
    await tx.job.deleteMany({ where: { userId: uid } });

    // --- Delete User (cascades all remaining direct FK relations) ---
    await tx.user.delete({ where: { id: uid } });
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
    await fs.rm(path.join(LOGO_BASE_DIR, uid), {
      recursive: true,
      force: true,
    });
  } catch {
    // Best-effort — never throw on file cleanup errors
  }

  return { success: true };
}
