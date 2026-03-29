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
      throw new Error("Not authenticated");
    }

    const activityTypes = await prisma.activityType.findMany({
      where: {
        createdBy: user.id,
      },
    });
    return { success: true, data: activityTypes as ActivityType[] };
  } catch (error) {
    const msg = "Failed to fetch all activity types. ";
    return handleError(error, msg);
  }
};

export const createActivityType = async (
  label: string
): Promise<ActionResult<ActivityType>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const value = label.trim().toLowerCase();

    const upsertedActivityType = await prisma.activityType.upsert({
      where: { value_createdBy: { value, createdBy: user.id } },
      update: { label },
      create: { label, value, createdBy: user.id },
    });

    return { success: true, data: upsertedActivityType };
  } catch (error) {
    const msg = "Failed to create activity type. ";
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
      throw new Error("Not authenticated");
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
    const msg = "Failed to fetch activities list. ";
    return handleError(error, msg);
  }
};

export const createActivity = async (
  data: Activity
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
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
    const msg = "Failed to create activity. ";
    return handleError(error, msg);
  }
};

export const deleteActivityById = async (
  activityId: string
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const res = await prisma.activity.delete({
      where: {
        id: activityId,
        userId: user.id,
      },
    });
    return { data: res, success: true };
  } catch (error) {
    const msg = "Failed to delete job.";
    return handleError(error, msg);
  }
};

export const startActivityById = async (
  activityId: string
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
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
        message: "An activity is already in progress. Stop it before starting a new one.",
      };
    }

    const activity = await prisma.activity.findFirst({
      where: {
        id: activityId,
        userId: user.id,
      },
    });

    if (!activity) {
      throw new Error("Activity not found");
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
    const msg = "Failed to start activity. ";
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
      throw new Error("Not authenticated");
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
    const msg = "Failed to stop activity. ";
    return handleError(error, msg);
  }
};

export const getCurrentActivity = async (): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
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
    const msg = "Failed to get current activity. ";
    return handleError(error, msg);
  }
};

export const getActivityById = async (
  activityId: string
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
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
      return { success: false, message: "Activity not found" };
    }

    return {
      success: true,
      data: activity,
    };
  } catch (error) {
    const msg = "Failed to fetch activity.";
    return handleError(error, msg);
  }
};

export const updateActivity = async (
  data: Activity
): Promise<ActionResult<Activity>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
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
      return { success: false, message: "Activity not found" };
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
      message: "Activity updated successfully",
    };
  } catch (error) {
    const msg = "Failed to update activity.";
    return handleError(error, msg);
  }
};
