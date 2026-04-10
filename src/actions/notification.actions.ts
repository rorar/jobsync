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
 *
 * M-S-01: Explicit pre-flight ownership check returns {success:false} on
 * zero-match queries (non-owned or non-existent id) rather than relying
 * solely on Prisma P2025 being the only signal. This surfaces the correct
 * contract to callers that destructure `success` without inspecting the
 * error code.
 */
export async function markAsRead(
  notificationId: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    // Pre-flight ownership check (ADR-015): verify the notification exists
    // and belongs to this user before attempting the update. Returns a
    // consistent {success:false} for both "not found" and "wrong owner"
    // so callers cannot distinguish the two cases (prevents enumeration).
    const owned = await prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

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
 *
 * M-S-01: Same explicit ownership pre-flight as markAsRead — returns
 * {success:false} on zero-match instead of relying solely on P2025.
 */
export async function dismissNotification(
  notificationId: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    // Pre-flight ownership check (ADR-015): same pattern as markAsRead.
    const owned = await prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

    await prisma.notification.delete({
      where: { id: notificationId, userId: user.id },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.dismissNotification");
  }
}

