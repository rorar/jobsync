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
import { logoAssetService } from "@/lib/assets/logo-asset-service";
import fs from "fs/promises";

export const getCompanyList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  countBy?: string,
): Promise<ActionResult<Company[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
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
    const msg = "Failed to fetch company list. ";
    return handleError(error, msg);
  }
};

export const getAllCompanies = async (): Promise<ActionResult<Company[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const companies = await prisma.company.findMany({
      where: {
        createdBy: user.id,
      },
    });
    return { success: true, data: companies as Company[] };
  } catch (error) {
    const msg = "Failed to fetch all companies. ";
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
      throw new Error("Not authenticated");
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
      throw new Error("Company already exists!");
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
    const msg = "Failed to create company.";
    return handleError(error, msg);
  }
};

export const updateCompany = async (
  data: z.infer<typeof AddCompanyFormSchema>,
): Promise<ActionResult<Company>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
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
    const msg = "Failed to update company.";
    return handleError(error, msg);
  }
};

export const getCompanyById = async (
  companyId: string,
): Promise<ActionResult<Company>> => {
  try {
    if (!companyId) {
      throw new Error("Please provide company id");
    }
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        createdBy: user.id,
      },
    });
    return { success: true, data: company ?? undefined };
  } catch (error) {
    const msg = "Failed to fetch company by Id. ";
    console.error(msg);
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: msg };
  }
};

export const deleteCompanyById = async (
  companyId: string,
): Promise<ActionResult<Company>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
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
        await fs.unlink(logoAsset.filePath);
        // Try to remove empty directories (company-level, then user-level)
        const path = await import("path");
        const companyDir = path.dirname(logoAsset.filePath);
        try {
          await fs.rmdir(companyDir);
          const userDir = path.dirname(companyDir);
          await fs.rmdir(userDir);
        } catch {
          // Directory not empty — expected
        }
      } catch {
        // File already gone — proceed
      }
    }

    const res = await prisma.company.delete({
      where: {
        id: companyId,
        createdBy: user.id,
      },
    });
    return { data: res, success: true };
  } catch (error) {
    const msg = "Failed to delete company.";
    return handleError(error, msg);
  }
};
