"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { AddCompanyFormSchema } from "@/models/addCompanyForm.schema";
import { ActionResult } from "@/models/actionResult";
import { Company } from "@/models/job.model";
import { getCurrentUser } from "@/utils/user.utils";
import { APP_CONSTANTS } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitEvent, createEvent, DomainEventTypes } from "@/lib/events";
import { buildOrphanedCrmPruneOps } from "@/lib/crm/orphan-targets";
import { deleteFileAndPruneEmptyParents } from "@/lib/assets/file-cleanup";
import { logoAssetService, LOGO_PRUNE_LEVELS } from "@/lib/assets/logo-asset-service";

export const getCompanyList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  countBy?: string,
): Promise<ActionResult<Company[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.company.findMany({
        where: {
          createdBy: user.id,
        },
        skip,
        take: limit,
        ...(countBy
          ? {
              select: {
                id: true,
                label: true,
                value: true,
                logoUrl: true,
                logoAssetId: true,
                createdBy: true,
                _count: {
                  select: {
                    jobsApplied: {
                      where: {
                        applied: true,
                      },
                    },
                  },
                },
              },
            }
          : {}),
        orderBy: {
          jobsApplied: {
            _count: "desc",
          },
        },
      }),
      prisma.company.count({
        where: {
          createdBy: user.id,
        },
      }),
    ]);
    return { success: true, data, total };
  } catch (error) {
    const msg = "errors.fetchFailed";
    return handleError(error, msg);
  }
};

export const getAllCompanies = async (): Promise<ActionResult<Company[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const companies = await prisma.company.findMany({
      where: {
        createdBy: user.id,
      },
    });
    return { success: true, data: companies as Company[] };
  } catch (error) {
    const msg = "errors.fetchFailed";
    return handleError(error, msg);
  }
};

const isValidImageUrl = (url: string): boolean => {
  if (!url) return true;
  try {
    const urlObj = new URL(url);
    // Only allow http and https protocols
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const addCompany = async (
  data: z.infer<typeof AddCompanyFormSchema>,
): Promise<ActionResult<Company>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const { company, logoUrl } = data;

    // Validate image URL
    if (logoUrl && !isValidImageUrl(logoUrl)) {
      throw new Error(
        "Invalid logo URL. Only http and https protocols are allowed.",
      );
    }

    const value = company.trim().toLowerCase();

    const companyExists = await prisma.company.findFirst({
      where: {
        value,
        createdBy: user.id,
      },
    });

    if (companyExists) {
      // Log-only: handleError below collapses this to `errors.createFailed`
      // for the caller. Kept as an i18n key for log hygiene.
      throw new Error("crm.errors.companyExists");
    }

    const res = await prisma.company.create({
      data: {
        createdBy: user.id,
        value,
        label: company,
        logoUrl,
      },
    });

    // Emit domain event for automatic enrichment (spec: TriggerEnrichmentOnCompanyCreated)
    emitEvent(
      createEvent(DomainEventTypes.CompanyCreated, {
        companyId: res.id,
        companyName: company,
        userId: user.id,
      }),
    );

    revalidatePath("/dashboard/myjobs", "page");
    return { success: true, data: res };
  } catch (error) {
    const msg = "errors.createFailed";
    return handleError(error, msg);
  }
};

/**
 * Resolve a company by name, creating it if it does not exist yet.
 *
 * The picker-facing counterpart to {@link addCompany}: an already-existing
 * company is RETURNED rather than treated as an error, because in an inline-
 * create flow the user's intent ("link this contact to this company") is
 * satisfied by the existing row. Name matching uses the same normalisation as
 * `addCompany` (`trim().toLowerCase()`), so "  ACME " resolves onto "Acme".
 *
 * Distinct error cases are returned explicitly rather than thrown: `handleError`
 * discards a thrown message and substitutes the caller's fallback key
 * (`src/lib/utils.ts:87`), so throwing would collapse them into one message.
 *
 * IDOR (ADR-015): both the lookup and the create are scoped by `createdBy`.
 * Creating emits `CompanyCreated`, which drives domain auto-fill and logo
 * enrichment (`src/lib/events/consumers/enrichment-trigger.ts`).
 *
 * Spec: specs/crm.allium `CompanyAssociation.company` is a required reference.
 */
export const findOrCreateCompany = async (
  name: string,
): Promise<ActionResult<Company>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const label = name.trim();
    if (!label) {
      return { success: false, message: "crm.errors.companyNameRequired" };
    }

    const value = label.toLowerCase();

    const existing = await prisma.company.findFirst({
      where: {
        value,
        createdBy: user.id,
      },
    });

    if (existing) {
      return { success: true, data: existing as Company };
    }

    const created = await prisma.company.create({
      data: {
        createdBy: user.id,
        value,
        label,
      },
    });

    emitEvent(
      createEvent(DomainEventTypes.CompanyCreated, {
        companyId: created.id,
        companyName: label,
        userId: user.id,
      }),
    );

    return { success: true, data: created as Company };
  } catch (error) {
    const msg = "errors.createFailed";
    return handleError(error, msg);
  }
};

export const updateCompany = async (
  data: z.infer<typeof AddCompanyFormSchema>,
): Promise<ActionResult<Company>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const { id, company, logoUrl } = data;

    if (!id) {
      throw new Error("Id is not provided");
    }

    // Validate image URL
    if (logoUrl && !isValidImageUrl(logoUrl)) {
      throw new Error(
        "Invalid logo URL. Only http and https protocols are allowed.",
      );
    }

    const value = company.trim().toLowerCase();

    const companyExists = await prisma.company.findFirst({
      where: {
        value,
        createdBy: user.id,
      },
    });

    if (companyExists && companyExists.id !== id) {
      throw new Error("Company already exists!");
    }

    // Detect logoUrl change for logo asset download trigger
    const existingCompany = await prisma.company.findFirst({
      where: { id, createdBy: user.id },
      select: { logoUrl: true },
    });

    // Ownership enforced at Prisma level, not via client-submitted createdBy
    const res = await prisma.company.update({
      where: {
        id,
        createdBy: user.id,
      },
      data: {
        value,
        label: company,
        logoUrl,
      },
    });

    // If logoUrl changed and is non-empty, fire-and-forget download
    if (logoUrl && logoUrl !== existingCompany?.logoUrl) {
      logoAssetService
        .downloadAndProcess(logoUrl, user.id, id)
        .catch((error) => {
          console.error(
            "[updateCompany] Fire-and-forget logo download failed:",
            error,
          );
        });
    }

    return { success: true, data: res };
  } catch (error) {
    const msg = "errors.updateFailed";
    return handleError(error, msg);
  }
};

export const getCompanyById = async (
  companyId: string,
): Promise<ActionResult<Company>> => {
  if (!companyId) {
    return { success: false, message: "errors.invalidInput" };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, message: "errors.notAuthenticated" };
  }
  try {
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        createdBy: user.id,
      },
    });
    return { success: true, data: company ?? undefined };
  } catch (error) {
    return handleError(error, "errors.fetchFailed");
  }
};

export const deleteCompanyById = async (
  companyId: string,
): Promise<ActionResult<Company>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const experiences = await prisma.workExperience.count({
      where: {
        companyId,
      },
    });
    if (experiences > 0) {
      throw new Error(
        `Company cannot be deleted due to its use in experience section of one of the resume! `,
      );
    }
    const jobs = await prisma.job.count({
      where: {
        companyId,
      },
    });

    if (jobs > 0) {
      throw new Error(
        `Company cannot be deleted due to ${jobs} number of associated jobs! `,
      );
    }

    // Cleanup logo asset file before company deletion (disk + DB handled by cascade)
    const logoAsset = await prisma.logoAsset.findFirst({
      where: { companyId, userId: user.id },
      select: { filePath: true },
    });
    if (logoAsset?.filePath) {
      try {
        await deleteFileAndPruneEmptyParents(logoAsset.filePath, LOGO_PRUNE_LEVELS);
      } catch {
        // File cleanup failed — proceed with company deletion
      }
    }

    // W-D3: deleting the Company cascades away its CrmNoteTarget/CrmTaskTarget rows,
    // leaving a note or task targeted ONLY at this company with zero targets. Prune
    // in the same transaction; the prune ops run last, after the cascade.
    const [res] = await prisma.$transaction([
      prisma.company.delete({
        where: {
          id: companyId,
          createdBy: user.id,
        },
      }),
      ...buildOrphanedCrmPruneOps(prisma, user.id),
    ]);
    return { data: res, success: true };
  } catch (error) {
    const msg = "errors.deleteFailed";
    return handleError(error, msg);
  }
};
