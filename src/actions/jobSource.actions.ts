"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { JobSource } from "@/models/job.model";
import { getCurrentUser } from "@/utils/user.utils";
import { APP_CONSTANTS } from "@/lib/constants";

export const getJobSourceList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  countBy?: string
): Promise<ActionResult<JobSource[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.jobSource.findMany({
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
      prisma.jobSource.count({
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

export const deleteJobSourceById = async (
  jobSourceId: string
): Promise<ActionResult<JobSource>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const jobs = await prisma.job.count({
      where: {
        jobSourceId,
      },
    });

    if (jobs > 0) {
      throw new Error(
        `Job source cannot be deleted due to ${jobs} number of associated jobs! `
      );
    }

    const res = await prisma.jobSource.delete({
      where: {
        id: jobSourceId,
        createdBy: user.id,
      },
    });
    return { success: true, data: res };
  } catch (error) {
    const msg = "errors.deleteFailed";
    return handleError(error, msg);
  }
};
