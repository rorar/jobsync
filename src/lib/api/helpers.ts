import prisma from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Shared helpers for Public API v1 route handlers.
 */

// --- Entity resolution ---

type UpsertableEntity = "jobTitle" | "company" | "location" | "jobSource";

/**
 * Find-or-create a label/value entity owned by the given user.
 * Uses upsert to avoid TOCTOU race conditions.
 */
export async function findOrCreate(
  type: UpsertableEntity,
  userId: string,
  label: string,
): Promise<{ id: string }> {
  const value = label.trim().toLowerCase();

  // Type-safe upsert per entity — avoids `prisma[type] as any`.
  switch (type) {
    case "jobTitle":
      return prisma.jobTitle.upsert({
        where: { value_createdBy: { value, createdBy: userId } },
        update: {},
        create: { label: label.trim(), value, createdBy: userId },
        select: { id: true },
      });
    case "company":
      return prisma.company.upsert({
        where: { value_createdBy: { value, createdBy: userId } },
        update: {},
        create: { label: label.trim(), value, createdBy: userId },
        select: { id: true },
      });
    case "location":
      return prisma.location.upsert({
        where: { value_createdBy: { value, createdBy: userId } },
        update: {},
        create: { label: label.trim(), value, createdBy: userId },
        select: { id: true },
      });
    case "jobSource":
      return prisma.jobSource.upsert({
        where: { value_createdBy: { value, createdBy: userId } },
        update: {},
        create: { label: label.trim(), value, createdBy: userId },
        select: { id: true },
      });
  }
}

/**
 * Resolve a job status for a user (Welle 4: per-user statuses, ADR-015).
 * With a value, resolves that value within the user's statuses; without one,
 * resolves the user's default status (no more hardcoded "draft" — it is no
 * longer a seeded value, so the old default would 400 every defaulted create).
 */
export async function resolveStatus(statusValue: string | undefined, userId: string) {
  if (statusValue) {
    return prisma.jobStatus.findFirst({
      where: { value: statusValue, userId },
      select: { id: true, value: true },
    });
  }
  return prisma.jobStatus.findFirst({
    where: { userId, isDefault: true },
    select: { id: true, value: true },
  });
}

// --- Shared select shapes ---

/** Select for label/value entities (JobTitle, Company, Location, JobSource). */
const labelValueSelect = { id: true, label: true, value: true } as const;

/** Select for Tag entities. */
const tagSelect = { id: true, label: true, value: true } as const;

/**
 * Shared Prisma `select` clause for job responses.
 * Excludes userId, matchData, automationId, discoveryStatus, and all foreign key IDs.
 */
export const JOB_API_SELECT = {
  id: true,
  createdAt: true,
  jobType: true,
  jobUrl: true,
  description: true,
  salaryRange: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryPeriod: true,
  salaryBonus: true,
  dueDate: true,
  appliedDate: true,
  applied: true,
  matchScore: true,
  version: true,
  // Welle 3 (F-AJ-08): recruiter triangle. Expose the relation (label/value) +
  // the relationship type — never the raw recruitingCompanyId FK (leak rule).
  relationshipType: true,
  JobTitle: { select: labelValueSelect },
  Company: { select: labelValueSelect },
  RecruitingCompany: { select: labelValueSelect },
  Status: { select: labelValueSelect },
  Location: { select: labelValueSelect },
  JobSource: { select: labelValueSelect },
  tags: { select: tagSelect },
} satisfies Prisma.JobSelect;

/**
 * Extended select for single-job detail (includes Resume + note count).
 */
export const JOB_DETAIL_SELECT = {
  ...JOB_API_SELECT,
  Resume: {
    select: {
      id: true,
      title: true,
      File: { select: { id: true, fileName: true, fileType: true } },
    },
  },
  _count: { select: { Notes: true } },
} satisfies Prisma.JobSelect;

/**
 * Select for the jobs list endpoint (same as detail but with note count, no Resume).
 */
export const JOB_LIST_SELECT = {
  ...JOB_API_SELECT,
  _count: { select: { Notes: true } },
} satisfies Prisma.JobSelect;
