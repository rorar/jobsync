"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { JobLocation } from "@/models/job.model";
import { getCurrentUser } from "@/utils/user.utils";
import { APP_CONSTANTS } from "@/lib/constants";

export const getAllJobLocations = async (): Promise<ActionResult<JobLocation[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("errors.notAuthenticated");
    }
    const list = await prisma.location.findMany({
      where: {
        createdBy: user.id,
      },
    });
    return { success: true, data: list as JobLocation[] };
  } catch (error) {
    const msg = "errors.fetchFailed";
    return handleError(error, msg);
  }
};

export const getJobLocationsList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  countBy?: string
): Promise<ActionResult<JobLocation[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.location.findMany({
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
      prisma.location.count({
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

export const deleteJobLocationById = async (
  locationId: string
): Promise<ActionResult<JobLocation>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

      // ADR-015: a WorkExperience is owned through its resume chain
      // (ResumeSection -> Resume -> Profile -> userId). Counting unscoped made
      // another user's resume block this delete, and leaked its existence.
      // Rows with no section belong to no resume and cannot surface anywhere.
    const experiences = await prisma.workExperience.count({
      where: {
        locationId,
        ResumeSection: { Resume: { profile: { userId: user.id } } },
      },
    });
    if (experiences > 0) {
      throw new Error(
        `Job location cannot be deleted due to its use in experience section of one of the resume! `
      );
    }

    // ADR-015, and the comment above is why this line is not a copy of it: an
    // Education is owned through the SAME resume chain as a WorkExperience
    // (`Education.ResumeSection` -> `Resume` -> `profile` -> `userId`,
    // prisma/schema.prisma:233-234), and this guard was counting it unscoped.
    // The defect the paragraph above describes as fixed — "another user's
    // resume blocked this delete, and leaked its existence" — was still live
    // one guard below it. Found 2026-09-08 while surveying the reference
    // deletes for E2E-B44.
    const educations = await prisma.education.count({
      where: {
        locationId,
        ResumeSection: { Resume: { profile: { userId: user.id } } },
      },
    });
    if (educations > 0) {
      throw new Error(
        `Job location cannot be deleted due to its use in education section of one of the resume! `
      );
    }

    // ADR-015: scope the guard to this user's jobs.
    const jobs = await prisma.job.count({
      where: {
        locationId,
        userId: user.id,
      },
    });

    if (jobs > 0) {
      throw new Error(
        `Location cannot be deleted while jobs still reference it! `
      );
    }

    const res = await prisma.location.delete({
      where: {
        id: locationId,
        createdBy: user.id,
      },
    });
    return { success: true, data: res };
  } catch (error) {
    const msg = "errors.deleteFailed";
    return handleError(error, msg);
  }
};
