/**
 * InAppChannel — In-App Notification Channel
 *
 * Extracts the existing in-app notification logic from notification-dispatcher.ts
 * into a proper NotificationChannel implementation.
 *
 * Creates Prisma Notification records directly (the original behavior).
 */

import prisma from "@/lib/db";
import type { NotificationType } from "@/models/notification.model";
import type { NotificationChannel, NotificationDraft, ChannelResult } from "../types";

export class InAppChannel implements NotificationChannel {
  readonly name = "inApp";

  async dispatch(notification: NotificationDraft, userId: string): Promise<ChannelResult> {
    try {
      await prisma.notification.create({
        data: {
          userId,
          type: notification.type satisfies NotificationType,
          message: notification.message,
          ...(notification.moduleId ? { moduleId: notification.moduleId } : {}),
          ...(notification.automationId ? { automationId: notification.automationId } : {}),
        },
      });
      return { success: true, channel: this.name };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[InAppChannel] Failed to create notification:`, error);
      return { success: false, channel: this.name, error: errorMessage };
    }
  }

  async isAvailable(_userId: string): Promise<boolean> {
    // In-app notifications are always available — they just need a DB.
    return true;
  }
}
