"use server";

import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import type { Notification } from "@/models/notification.model";

/**
 * Fetch notifications for the current user.
 * @param unreadOnly - if true, only return unread notifications
 * @param limit - max number of notifications to return (default 20)
 */
export async function getNotifications(
  unreadOnly = false,
  limit = 20,
): Promise<ActionResult<Notification[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { success: true, data: notifications as Notification[] };
  } catch (error) {
    return handleError(error, "Failed to fetch notifications");
  }
}

/**
 * Get the count of unread notifications for the current user.
 */
export async function getUnreadCount(): Promise<ActionResult<number>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const count = await prisma.notification.count({
      where: { userId: user.id, read: false },
    });

    return { success: true, data: count };
  } catch (error) {
    return handleError(error, "Failed to fetch unread count");
  }
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(
  notificationId: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    await prisma.notification.update({
      where: { id: notificationId, userId: user.id },
      data: { read: true },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to mark notification as read");
  }
}

/**
 * Mark all notifications as read for the current user.
 */
export async function markAllAsRead(): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to mark all notifications as read");
  }
}

/**
 * Create a notification record in the database.
 * This is an internal function called by degradation rules and module actions,
 * not directly by the UI. No auth check needed — callers are server-side code.
 */
export async function createNotification(params: {
  userId: string;
  type: string;
  message: string;
  moduleId?: string;
  automationId?: string;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      message: params.message,
      moduleId: params.moduleId ?? null,
      automationId: params.automationId ?? null,
    },
  });
}
