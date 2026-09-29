"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { Activity, ActivityType } from "@/models/activity.model";
import { ActionResult } from "@/models/actionResult";
import { getCurrentUser } from "@/utils/user.utils";
import { APP_CONSTANTS } from "@/lib/constants";

export const getAllActivityTypes = async (): Promise<ActionResult<ActivityType[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const activityTypes = await prisma.activityType.findMany({
      where: {
        createdBy: user.id,
      },
    });
    return { success: true, data: activityTypes as ActivityType[] };
  } catch (error) {
    const msg = "errors.fetchFailed";
    return handleError(error, msg);
  }
};

export const getActivityTypeList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  countBy?: string
): Promise<ActionResult<ActivityType[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.activityType.findMany({
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
                // Capitalised relation names — prisma/schema.prisma:491-492
                // declares `Activities Activity[]` and `Tasks Task[]`, so the
                // count keys are not the lower-case ones the siblings use.
                _count: {
                  select: {
                    Activities: true,
                    Tasks: true,
                  },
                },
              },
            }
          : {}),
        orderBy: {
          Activities: {
            _count: "desc",
          },
        },
      }),
      prisma.activityType.count({
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

export const createActivityType = async (
  label: string
): Promise<ActionResult<ActivityType>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const value = label.trim().toLowerCase();

    const upsertedActivityType = await prisma.activityType.upsert({
      where: { value_createdBy: { value, createdBy: user.id } },
      update: { label },
      create: { label, value, createdBy: user.id },
    });

    return { success: true, data: upsertedActivityType };
  } catch (error) {
    const msg = "errors.createFailed";
    return handleError(error, msg);
  }
};

export const deleteActivityTypeById = async (
  activityTypeId: string
): Promise<ActionResult<ActivityType>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    // ADR-015: scope the guard to this user's activities.
    //
    // The database already refuses this delete on its own: Activity.activityTypeId
    // is NOT NULL (prisma/schema.prisma:510) behind an ON DELETE RESTRICT foreign
    // key (Activity_activityTypeId_fkey, most recently written in
    // prisma/migrations/20260513170926_s1_account_deletion_cascades/migration.sql:17).
    // The count exists to turn that refusal into a translated message rather than
    // a raw P2003.
    //
    // Scoping leaves a residual gap, and it is the right trade: the constraint is
    // global while this count is per-user, so an activity belonging to somebody
    // else passes the guard and the delete then fails with P2003, which
    // handleError maps to errors.referenceError (src/lib/utils.ts:57). That is a
    // graceful translated failure. Widening the count to close it would let
    // another user's rows block this delete and leak their existence — the exact
    // defect ADR-015 is about, and the one jobtitle.actions.ts:120-123 records
    // having been fixed for. All five sibling reference deletes (tag, company,
    // jobtitle, jobSource, jobLocation) carry the same residual by the same
    // choice.
    const activities = await prisma.activity.count({
      where: {
        activityTypeId,
        userId: user.id,
      },
    });

    if (activities > 0) {
      throw new Error(
        `Activity type cannot be deleted while activities still reference it! `
      );
    }

    // There is deliberately NO Task guard here. The two foreign keys onto
    // ActivityType are asymmetric, and the asymmetry is in the generated SQL, not
    // in a Prisma default: Task_activityTypeId_fkey is ON DELETE SET NULL
    // (prisma/migrations/20260113163354_add_task_model/migration.sql:15) over a
    // nullable column (prisma/schema.prisma:531). A task with no activity type is
    // a first-class valid state, not a broken one — src/models/addTaskForm.schema.ts:30
    // has the field `optional().nullable()`, src/models/task.model.ts:29 types it
    // `string | null`, and src/components/tasks/TasksSidebar.tsx:30-46 renders the
    // "All" bucket such a task stays in. Blocking on tasks would make a type
    // permanently undeletable for a state the domain explicitly supports. The UI
    // warns about the task count instead and lets the user proceed.
    const res = await prisma.activityType.delete({
      where: {
        id: activityTypeId,
        createdBy: user.id,
      },
    });
    return { success: true, data: res };
  } catch (error) {
    const msg = "errors.deleteFailed";
    return handleError(error, msg);
  }
};

export const getActivitiesList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  search?: string
): Promise<ActionResult<Activity[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const offset = (page - 1) * limit;

    const whereClause: any = {
      userId: user.id,
      endTime: {
        not: null,
      },
    };

    if (search) {
      whereClause.OR = [
        { activityName: { contains: search } },
        { description: { contains: search } },
        { activityType: { label: { contains: search } } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.activity.findMany({
        where: whereClause,
        include: {
          activityType: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: offset,
        take: limit,
      }),
      prisma.activity.count({
        where: whereClause,
      }),
    ]);

    return {
      success: true,
      data,
      total,
    };
  } catch (error) {
    const msg = "errors.fetchFailed";
    return handleError(error, msg);
  }
};

export const createActivity = async (
  data: Activity
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const {
      activityName,
      activityTypeId,
      startTime,
      endTime,
      duration,
      description,
    } = data;

    const activity = await prisma.activity.create({
      data: {
        activityName,
        activityTypeId,
        userId: user.id,
        startTime,
        endTime,
        duration,
        description,
      },
    });
    return { data: activity, success: true };
  } catch (error) {
    const msg = "errors.createFailed";
    return handleError(error, msg);
  }
};

export const deleteActivityById = async (
  activityId: string
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const res = await prisma.activity.delete({
      where: {
        id: activityId,
        userId: user.id,
      },
    });
    return { data: res, success: true };
  } catch (error) {
    const msg = "errors.deleteFailed";
    return handleError(error, msg);
  }
};

export const startActivityById = async (
  activityId: string
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    // Check for existing active activity to prevent concurrent activities
    const existingActive = await prisma.activity.findFirst({
      where: {
        userId: user.id,
        endTime: null,
      },
    });

    if (existingActive) {
      return {
        success: false,
        message: "activities.alreadyInProgress",
      };
    }

    const activity = await prisma.activity.findFirst({
      where: {
        id: activityId,
        userId: user.id,
      },
    });

    if (!activity) {
      throw new Error("errors.notFound");
    }
    const { activityName, activityTypeId, description } = activity;

    const newActivity = await prisma.activity.create({
      data: {
        activityName,
        activityTypeId,
        userId: user.id,
        startTime: new Date(),
        endTime: null,
        description,
      },
      include: {
        activityType: true,
      },
    });
    return { data: newActivity, success: true };
  } catch (error) {
    const msg = "errors.unknown";
    return handleError(error, msg);
  }
};

export const stopActivityById = async (
  activityId: string,
  endTime: Date,
  duration: number
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const activity = await prisma.activity.update({
      where: {
        id: activityId,
        userId: user.id,
      },
      data: {
        endTime,
        duration,
      },
    });
    return { data: activity, success: true };
  } catch (error) {
    const msg = "errors.unknown";
    return handleError(error, msg);
  }
};

export const getCurrentActivity = async (): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const activity = await prisma.activity.findFirst({
      where: {
        userId: user.id,
        endTime: null,
      },
      include: {
        activityType: true,
      },
    });

    if (!activity) {
      return { success: false };
    }

    return { data: activity, success: true };
  } catch (error) {
    const msg = "errors.fetchFailed";
    return handleError(error, msg);
  }
};

export const getActivityById = async (
  activityId: string
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const activity = await prisma.activity.findFirst({
      where: {
        id: activityId,
        userId: user.id,
      },
      include: {
        activityType: true,
      },
    });

    if (!activity) {
      return { success: false, message: "errors.notFound" };
    }

    return {
      success: true,
      data: activity,
    };
  } catch (error) {
    const msg = "errors.fetchFailed";
    return handleError(error, msg);
  }
};

export const updateActivity = async (
  data: Activity
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    if (!data.id) {
      throw new Error("Activity ID is required for update");
    }

    const existing = await prisma.activity.findFirst({
      where: {
        id: data.id,
        userId: user.id,
      },
    });

    if (!existing) {
      return { success: false, message: "errors.notFound" };
    }

    const updated = await prisma.activity.update({
      where: {
        id: data.id,
      },
      data: {
        activityName: data.activityName,
        activityTypeId: data.activityTypeId,
        startTime: data.startTime,
        endTime: data.endTime ?? null,
        duration: data.duration ?? null,
        description: data.description ?? null,
      },
      include: {
        activityType: true,
      },
    });

    return {
      success: true,
      data: updated,
      message: "activities.updateSuccess",
    };
  } catch (error) {
    const msg = "errors.updateFailed";
    return handleError(error, msg);
  }
};
