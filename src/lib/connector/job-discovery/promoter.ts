import "server-only";
import db from "@/lib/db";
import { normalizeForSearch, extractKeywords, extractCityName } from "./utils";
import { emitEvent } from "@/lib/events";
import type { PromotionInput } from "@/models/stagedVacancy.model";

export interface PromotionResult {
  jobId: string;
  stagedVacancyId: string;
}

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

  // Entire promotion flow runs inside a single transaction for atomicity.
  // Reference-data find-or-create calls use `tx` instead of the global `db`
  // to ensure all writes are part of the same atomic block.
  const result = await db.$transaction(async (tx) => {
    // Set to processing
    await tx.stagedVacancy.update({
      where: { id: vacancy.id },
      data: { status: "processing" },
    });

    // Find-or-create reference data inline (using tx for atomicity)
    const [jobTitleId, companyId, locationId, jobSourceId, statusId] =
      await Promise.all([
        findOrCreateJobTitleTx(tx, input.jobTitleOverride ?? vacancy.title, userId),
        findOrCreateCompanyTx(
          tx,
          input.companyOverride ?? vacancy.employerName ?? "Unknown",
          userId,
        ),
        findOrCreateLocationTx(
          tx,
          input.locationOverride ?? vacancy.location ?? "",
          userId,
        ),
        getOrCreateJobSourceTx(tx, vacancy.sourceBoard, userId),
        getDefaultJobStatusTx(tx),
      ]);

    // Create Job
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
// Transaction-aware reference-data helpers (inlined for atomicity)
// ---------------------------------------------------------------------------

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function findOrCreateJobTitleTx(
  tx: TxClient,
  title: string,
  userId: string,
): Promise<string> {
  const normalized = normalizeForSearch(title);

  let existing = await tx.jobTitle.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!existing) {
    const keywords = extractKeywords(title);
    if (keywords.length > 0) {
      existing = await tx.jobTitle.findFirst({
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

  const newTitle = await tx.jobTitle.create({
    data: { label: title, value: normalized, createdBy: userId },
  });
  return newTitle.id;
}

async function findOrCreateCompanyTx(
  tx: TxClient,
  company: string,
  userId: string,
): Promise<string> {
  const normalized = normalizeForSearch(company);

  let existing = await tx.company.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!existing) {
    const companyKeywords = extractKeywords(company);
    if (companyKeywords.length > 0) {
      existing = await tx.company.findFirst({
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

  const newCompany = await tx.company.create({
    data: { label: company, value: normalized, createdBy: userId },
  });
  return newCompany.id;
}

async function findOrCreateLocationTx(
  tx: TxClient,
  location: string,
  userId: string,
): Promise<string | null> {
  if (!location) return null;

  const normalized = normalizeForSearch(location);
  const cityName = extractCityName(location);

  let existing = await tx.location.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!existing && cityName) {
    existing = await tx.location.findFirst({
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

  const newLocation = await tx.location.create({
    data: { label: location, value: normalized, createdBy: userId },
  });
  return newLocation.id;
}

async function getOrCreateJobSourceTx(
  tx: TxClient,
  sourceBoard: string,
  userId: string,
): Promise<string> {
  const normalized = sourceBoard.toLowerCase();

  let jobSource = await tx.jobSource.findFirst({
    where: { value: normalized, createdBy: userId },
  });

  if (!jobSource) {
    jobSource = await tx.jobSource.create({
      data: {
        label: sourceBoard.charAt(0).toUpperCase() + sourceBoard.slice(1),
        value: normalized,
        createdBy: userId,
      },
    });
  }

  return jobSource.id;
}

async function getDefaultJobStatusTx(tx: TxClient): Promise<string> {
  // Prefer "bookmarked" (spec), fall back to "new" (backward compat)
  let status = await tx.jobStatus.findFirst({ where: { value: "bookmarked" } });

  if (!status) {
    status = await tx.jobStatus.findFirst({ where: { value: "new" } });
  }

  if (!status) {
    status = await tx.jobStatus.create({
      data: { label: "Bookmarked", value: "bookmarked" },
    });
  }

  return status.id;
}
