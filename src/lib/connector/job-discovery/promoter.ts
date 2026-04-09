import "server-only";
import db from "@/lib/db";
import { normalizeForSearch, extractKeywords, extractCityName } from "./utils";
import { emitEvent } from "@/lib/events";
import type { PromotionInput } from "@/models/stagedVacancy.model";

export interface PromotionResult {
  jobId: string;
  stagedVacancyId: string;
}

/**
 * Promote a staged vacancy to a Job.
 *
 * Sprint 2 H-P-08 performance fix:
 * The previous implementation executed up to 3 fuzzy OR-contains scans
 * (against JobTitle, Company, Location) INSIDE the write transaction. On
 * SQLite every write transaction holds a global DB-level write lock — so
 * every other writer (including automations running concurrently) stalled
 * until those three fuzzy scans completed against tables that grow
 * unboundedly with usage.
 *
 * The new flow is a two-phase resolve-then-commit pattern:
 *
 *   Phase 1 (OUTSIDE any transaction, read-only):
 *     Resolve jobTitleId, companyId, locationId, jobSourceId, statusId via
 *     fuzzy-contains lookups against the live `db` client. No write lock is
 *     held, so concurrent writers can proceed. If any resolver finds no
 *     existing row, it creates one in the SAME phase — reference data is a
 *     grow-only set so this create-on-miss is race-safe against other
 *     promotions; any duplicate that slips through the race is harmless.
 *
 *   Phase 2 (INSIDE a short write transaction):
 *     - Re-validate the StagedVacancy (status unchanged, still owned).
 *     - Flip the vacancy to `processing`, create the Job + initial
 *       JobStatusHistory, flip the vacancy to `promoted` with the new
 *       promotedToJobId. All writes use pre-computed IDs; the transaction
 *       holds no long-running scans.
 *
 * Preserved behaviour:
 *   - Same vacancy status guards as before (not already promoted, status in
 *     {staged, ready}, IDOR-scoped by userId).
 *   - Same find-or-create precedence: exact normalized value, then fuzzy
 *     keyword/city contains, then create.
 *   - Single VacancyPromoted event emitted after a successful commit.
 *   - Initial JobStatusHistory row with previousStatusId: null
 *     (rule InitialStatusOnPromotion).
 *   - Vacancy status transitions remain `staged/ready → processing →
 *     promoted` so the in-progress state is still observable to the UI.
 */
export async function promoteStagedVacancy(
  input: PromotionInput,
  userId: string,
): Promise<PromotionResult> {
  const vacancy = await db.stagedVacancy.findFirst({
    where: { id: input.stagedVacancyId, userId },
  });

  if (!vacancy) throw new Error("Staged vacancy not found");
  if (vacancy.status === "promoted") throw new Error("Already promoted");
  if (vacancy.status !== "staged" && vacancy.status !== "ready") {
    throw new Error(`Cannot promote vacancy in status "${vacancy.status}"`);
  }

  // ── Phase 1 — reference-data resolution OUTSIDE the transaction ────────
  //
  // All fuzzy OR-contains scans happen here against the non-transactional
  // `db` client. No write lock is held on any target table while these
  // scans run.
  const [jobTitleId, companyId, locationId, jobSourceId, statusId] =
    await Promise.all([
      findOrCreateJobTitle(input.jobTitleOverride ?? vacancy.title, userId),
      findOrCreateCompany(
        input.companyOverride ?? vacancy.employerName ?? "Unknown",
        userId,
      ),
      findOrCreateLocation(
        input.locationOverride ?? vacancy.location ?? "",
        userId,
      ),
      getOrCreateJobSource(vacancy.sourceBoard, userId),
      getDefaultJobStatus(),
    ]);

  // ── Phase 2 — short write transaction using pre-computed IDs ──────────
  //
  // Re-validate the vacancy state inside the transaction to catch any
  // concurrent status change between Phase 1 and Phase 2 (another tab or
  // automation may have dismissed / promoted the row while we were
  // resolving reference data).
  const result = await db.$transaction(async (tx) => {
    const current = await tx.stagedVacancy.findFirst({
      where: { id: vacancy.id, userId },
      select: { id: true, status: true },
    });

    if (!current) {
      throw new Error("Staged vacancy not found");
    }
    if (current.status === "promoted") {
      throw new Error("Already promoted");
    }
    if (current.status !== "staged" && current.status !== "ready") {
      throw new Error(`Cannot promote vacancy in status "${current.status}"`);
    }

    // Transition: staged/ready → processing (observable intermediate state)
    await tx.stagedVacancy.update({
      where: { id: vacancy.id },
      data: { status: "processing" },
    });

    // Create Job with pre-computed IDs
    const job = await tx.job.create({
      data: {
        userId,
        jobUrl: vacancy.sourceUrl,
        description: vacancy.description ?? "",
        jobType: vacancy.employmentType ?? "Full-time",
        createdAt: new Date(),
        applied: false,
        statusId,
        jobTitleId,
        companyId,
        jobSourceId,
        locationId,
        salaryRange: vacancy.salary,
        ...(input.tagsToApply && input.tagsToApply.length > 0
          ? { tags: { connect: input.tagsToApply.map((id) => ({ id })) } }
          : {}),
      },
    });

    // Create initial JobStatusHistory entry (spec: InitialStatusOnPromotion)
    await tx.jobStatusHistory.create({
      data: {
        jobId: job.id,
        userId,
        previousStatusId: null,
        newStatusId: statusId,
        note: null,
        changedAt: new Date(),
      },
    });

    // Link back (immutable after this)
    await tx.stagedVacancy.update({
      where: { id: vacancy.id },
      data: {
        status: "promoted",
        promotedToJobId: job.id,
      },
    });

    return { jobId: job.id, stagedVacancyId: vacancy.id };
  });

  // Emit domain event (stub for 0.6 Event Bus)
  emitEvent({
    type: "VacancyPromoted",
    timestamp: new Date(),
    payload: {
      stagedVacancyId: result.stagedVacancyId,
      jobId: result.jobId,
      userId,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Reference-data helpers (now non-transactional — run BEFORE the tx).
//
// These are safe to run outside a transaction because:
//   1. Reference data tables are grow-only; deletes are not part of the
//      normal flow, so a row we look up cannot disappear before Phase 2.
//   2. A race where two concurrent promotions both miss the same value and
//      each insert it would at worst create a duplicate reference-data row.
//      The existing `@@unique([value, createdBy])` constraint prevents true
//      duplicates — the second insert will throw and we retry via the
//      findFirst path in the caller. In practice the race window is
//      microseconds and the fallback is harmless.
// ---------------------------------------------------------------------------

async function findOrCreateJobTitle(
  title: string,
  userId: string,
): Promise<string> {
  const normalized = normalizeForSearch(title);

  let existing = await db.jobTitle.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!existing) {
    const keywords = extractKeywords(title);
    if (keywords.length > 0) {
      existing = await db.jobTitle.findFirst({
        where: {
          createdBy: userId,
          OR: keywords.map((keyword) => ({
            value: { contains: keyword },
          })),
        },
      });
    }
  }

  if (existing) return existing.id;

  try {
    const newTitle = await db.jobTitle.create({
      data: { label: title, value: normalized, createdBy: userId },
    });
    return newTitle.id;
  } catch {
    // Race: concurrent promotion inserted the same (value, createdBy) row.
    // Re-read and return the winner.
    const winner = await db.jobTitle.findFirst({
      where: { value: normalized, createdBy: userId },
    });
    if (!winner) throw new Error("Failed to resolve JobTitle after race");
    return winner.id;
  }
}

async function findOrCreateCompany(
  company: string,
  userId: string,
): Promise<string> {
  const normalized = normalizeForSearch(company);

  let existing = await db.company.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!existing) {
    const companyKeywords = extractKeywords(company);
    if (companyKeywords.length > 0) {
      existing = await db.company.findFirst({
        where: {
          createdBy: userId,
          OR: companyKeywords.map((keyword) => ({
            label: { contains: keyword },
          })),
        },
      });
    }
  }

  if (existing) return existing.id;

  try {
    const newCompany = await db.company.create({
      data: { label: company, value: normalized, createdBy: userId },
    });
    return newCompany.id;
  } catch {
    const winner = await db.company.findFirst({
      where: { value: normalized, createdBy: userId },
    });
    if (!winner) throw new Error("Failed to resolve Company after race");
    return winner.id;
  }
}

async function findOrCreateLocation(
  location: string,
  userId: string,
): Promise<string | null> {
  if (!location) return null;

  const normalized = normalizeForSearch(location);
  const cityName = extractCityName(location);

  let existing = await db.location.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!existing && cityName) {
    existing = await db.location.findFirst({
      where: {
        createdBy: userId,
        OR: [
          { value: { contains: cityName } },
          { label: { contains: cityName } },
        ],
      },
    });
  }

  if (existing) return existing.id;

  try {
    const newLocation = await db.location.create({
      data: { label: location, value: normalized, createdBy: userId },
    });
    return newLocation.id;
  } catch {
    const winner = await db.location.findFirst({
      where: { value: normalized, createdBy: userId },
    });
    if (!winner) throw new Error("Failed to resolve Location after race");
    return winner.id;
  }
}

async function getOrCreateJobSource(
  sourceBoard: string,
  userId: string,
): Promise<string> {
  const normalized = sourceBoard.toLowerCase();

  let jobSource = await db.jobSource.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (jobSource) return jobSource.id;

  try {
    jobSource = await db.jobSource.create({
      data: {
        label: sourceBoard.charAt(0).toUpperCase() + sourceBoard.slice(1),
        value: normalized,
        createdBy: userId,
      },
    });
    return jobSource.id;
  } catch {
    const winner = await db.jobSource.findFirst({
      where: { value: normalized, createdBy: userId },
    });
    if (!winner) throw new Error("Failed to resolve JobSource after race");
    return winner.id;
  }
}

async function getDefaultJobStatus(): Promise<string> {
  // Prefer "bookmarked" (spec), fall back to "new" (backward compat)
  let status = await db.jobStatus.findFirst({ where: { value: "bookmarked" } });

  if (!status) {
    status = await db.jobStatus.findFirst({ where: { value: "new" } });
  }

  if (!status) {
    try {
      status = await db.jobStatus.create({
        data: { label: "Bookmarked", value: "bookmarked" },
      });
    } catch {
      // Race: another promotion created it first.
      status = await db.jobStatus.findFirst({ where: { value: "bookmarked" } });
      if (!status) throw new Error("Failed to resolve default JobStatus");
    }
  }

  return status.id;
}
