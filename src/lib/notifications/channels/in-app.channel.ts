/**
 * InAppChannel — In-App Notification Channel
 *
 * Extracts the existing in-app notification logic from notification-dispatcher.ts
 * into a proper NotificationChannel implementation.
 *
 * Creates Prisma Notification records directly (the original behavior).
 */

import "server-only";

import prisma from "@/lib/db";
import type { NotificationType } from "@/models/notification.model";
import type { NotificationChannel, NotificationDraft, ChannelResult } from "../types";

export class InAppChannel implements NotificationChannel {
  readonly name = "inApp";

  async dispatch(notification: NotificationDraft, userId: string): Promise<ChannelResult> {
    try {
      // Dual-write the 5W+H structured fields (ADR-030): populate BOTH the
      // new top-level columns (severity/actorType/actorId/titleKey/...) and
      // the legacy `data.*` blob so older readers keep working during the
      // rollout. The Notification Prisma model now owns the 7 columns as
      // first-class nullable fields.
      await prisma.notification.create({
        data: {
          userId,
          type: notification.type satisfies NotificationType,
          message: notification.message,
          ...(notification.moduleId ? { moduleId: notification.moduleId } : {}),
          ...(notification.automationId ? { automationId: notification.automationId } : {}),
          ...(notification.data ? { data: notification.data as object } : {}),
          // Top-level 5W+H columns (new)
          ...(notification.severity ? { severity: notification.severity } : {}),
          ...(notification.actorType ? { actorType: notification.actorType } : {}),
          ...(notification.actorId ? { actorId: notification.actorId } : {}),
          ...(notification.titleKey ? { titleKey: notification.titleKey } : {}),
          ...(notification.titleParams ? { titleParams: notification.titleParams as object } : {}),
          ...(notification.reasonKey ? { reasonKey: notification.reasonKey } : {}),
          ...(notification.reasonParams ? { reasonParams: notification.reasonParams as object } : {}),
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
