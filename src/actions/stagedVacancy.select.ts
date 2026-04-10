import type { Prisma } from "@prisma/client";

/**
 * Shared Prisma `select` shape for the StagedVacancy LIST endpoint
 * (`getStagedVacancies`).
 *
 * This shape mirrors the field set read by `StagedVacancyCard` (list mode)
 * and `StagedVacancyDetailContent` (sheet mode) — the detail sheet reuses
 * the list row it was passed instead of re-fetching, so the list pays for
 * the detail render as well.
 *
 * **M-P-02 invariant:** this list MUST NOT include heavy JSON columns that
 * the UI never renders. Currently that means `matchData`. A regression guard
 * in `__tests__/stagedVacancy-list-select.spec.ts` fails the build if a
 * future editor re-adds one of those columns to this shape.
 *
 * Excluded on purpose:
 *   - `matchData`: large JSON blob, only consumed by `promoter` internals
 *     and (for promoted Jobs) `JobDetails.tsx`. Never read from a staged row.
 *   - `userId`: already used in the WHERE clause, not rendered.
 *   - `promotedToJobId`: irrelevant to list/sheet views (the sheet does not
 *     surface the promoted Job ID). If it ever becomes a UI field, add it
 *     here.
 *
 * **Non-server module.** Lives outside `stagedVacancy.actions.ts` because
 * Next.js "use server" files only allow async exports.
 */
export const STAGED_VACANCY_LIST_SELECT = {
  id: true,
  userId: true,

  // Discovery identity (dedup key / source metadata rendered in the sheet)
  sourceBoard: true,
  externalId: true,
  sourceUrl: true,

  // Vacancy data (card + sheet)
  title: true,
  employerName: true,
  location: true,
  description: true,
  salary: true,
  employmentType: true,
  postedAt: true,
  applicationDeadline: true,
  applicationInstructions: true,

  // Extended vacancy data (ROADMAP 1.1b Phase 1) — all rendered by the sheet
  companyUrl: true,
  companyDescription: true,
  industryCodes: true,
  companySize: true,
  positionOfferingCode: true,
  numberOfPosts: true,
  occupationUris: true,
  requiredEducationLevel: true,
  requiredExperienceYears: true,
  workingLanguages: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryPeriod: true,
  immediateStart: true,
  contractStartDate: true,
  contractEndDate: true,
  euresFlag: true,

  // Source tracking (card footer shows automation name)
  source: true,
  automationId: true,

  // Match score (rendered as ring; `matchData` JSON deliberately omitted)
  matchScore: true,

  // Pipeline state (drives tab filters + card action rail)
  status: true,

  // Archive / Trash (tab filters)
  archivedAt: true,
  trashedAt: true,

  // Timestamps
  discoveredAt: true,
  createdAt: true,
  updatedAt: true,

  // Related automation (used for source attribution — same select shape as
  // before, tight on purpose).
  automation: { select: { id: true, name: true } },
} as const satisfies Prisma.StagedVacancySelect;
