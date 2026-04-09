"use server";

import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import type { Notification } from "@/models/notification.model";

/**
 * Fetch notifications for the current user.
 *
 * The 5W+H structured fields (titleKey, titleParams, actorType, actorId,
 * reasonKey, reasonParams, severity) are first-class top-level columns on
 * the Notification model after ADR-030's Prisma migration. We do not
 * restrict `select` here — Prisma returns every scalar column by default,
 * including the new columns, so the domain `Notification` type returned by
 * this action is always up-to-date with the schema.
 *
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

    const safeTake = Math.min(Math.max(1, limit), 100);

    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: safeTake,
    });

    return { success: true, data: notifications as unknown as Notification[] };
  } catch (error) {
    return handleError(error, "errors.fetchNotifications");
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
    return handleError(error, "errors.fetchUnreadCount");
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
    return handleError(error, "errors.markNotificationRead");
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
    return handleError(error, "errors.markAllNotificationsRead");
  }
}

/**
 * Dismiss (delete) a single notification.
 */
export async function dismissNotification(
  notificationId: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    await prisma.notification.delete({
      where: { id: notificationId, userId: user.id },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.dismissNotification");
  }
}

