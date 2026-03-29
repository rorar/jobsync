import "server-only";
import db from "@/lib/db";
import {
  findOrCreateJobTitle,
  findOrCreateLocation,
  findOrCreateCompany,
  getOrCreateJobSource,
  getDefaultJobStatus,
} from "./reference-data";
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

  // Set to processing during the operation
  await db.stagedVacancy.update({
    where: { id: vacancy.id },
    data: { status: "processing" },
  });

  try {
    // Find-or-create reference data (Tracking context)
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

    // Create clean Job in a transaction
    const result = await db.$transaction(async (tx) => {
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
  } catch (error) {
    // Rollback status on failure
    await db.stagedVacancy
      .update({
        where: { id: vacancy.id },
        data: { status: vacancy.status },
      })
      .catch(() => {});
    throw error;
  }
}
