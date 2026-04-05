"use server";

/**
 * Server Actions for Browser Push Notifications (D3 Channel).
 *
 * VAPID key management, subscription CRUD, and test push dispatch.
 * All queries include userId (ADR-015 IDOR protection).
 * All error messages use i18n keys (feedback: feedback_i18n_error_messages.md).
 */

import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { encrypt } from "@/lib/encryption";
import { getOrCreateVapidKeys, rotateVapidKeys } from "@/lib/push/vapid";
import { checkTestPushRateLimit } from "@/lib/push/rate-limit";
import { PushChannel } from "@/lib/notifications/channels/push.channel";
import { ActionResult } from "@/models/actionResult";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expirationTime?: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum subscriptions per user (prevent abuse) */
const MAX_SUBSCRIPTIONS_PER_USER = 10;

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Get the VAPID public key for the current user.
 * Creates a new key pair if none exists.
 */
export async function getVapidPublicKeyAction(): Promise<
  ActionResult<{ publicKey: string }>
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    const keys = await getOrCreateVapidKeys(user.id);
    return { success: true, data: { publicKey: keys.publicKey } };
  } catch (error) {
    return handleError(error, "push.errorFetchingKey");
  }
}

/**
 * Subscribe a browser to push notifications.
 * Encrypts the subscription keys (p256dh, auth) before storage.
 * Upserts by (userId, endpoint) to handle re-subscriptions.
 */
export async function subscribePush(
  input: PushSubscriptionInput,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    // Validate input
    if (
      !input.endpoint ||
      typeof input.endpoint !== "string" ||
      !input.endpoint.startsWith("https://")
    ) {
      return { success: false, message: "push.invalidEndpoint" };
    }
    if (!input.keys?.p256dh || !input.keys?.auth) {
      return { success: false, message: "push.invalidKeys" };
    }

    // Check subscription limit (ADR-015: userId in where)
    const existingCount = await prisma.webPushSubscription.count({
      where: { userId: user.id },
    });
    if (existingCount >= MAX_SUBSCRIPTIONS_PER_USER) {
      // Check if this is an update to an existing subscription
      const existingSub = await prisma.webPushSubscription.findFirst({
        where: { userId: user.id, endpoint: input.endpoint },
      });
      if (!existingSub) {
        return { success: false, message: "push.tooManySubscriptions" };
      }
    }

    // Encrypt subscription keys separately
    const encP256dh = encrypt(input.keys.p256dh);
    const encAuth = encrypt(input.keys.auth);

    // Store both IVs concatenated with pipe separator
    const combinedIv = `${encP256dh.iv}|${encAuth.iv}`;

    // Upsert by (userId, endpoint) — handles re-subscription
    await prisma.webPushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId: user.id,
          endpoint: input.endpoint,
        },
      },
      update: {
        p256dh: encP256dh.encrypted,
        auth: encAuth.encrypted,
        iv: combinedIv,
        expirationTime: input.expirationTime
          ? new Date(input.expirationTime)
          : null,
      },
      create: {
        userId: user.id,
        endpoint: input.endpoint,
        p256dh: encP256dh.encrypted,
        auth: encAuth.encrypted,
        iv: combinedIv,
        expirationTime: input.expirationTime
          ? new Date(input.expirationTime)
          : null,
      },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "push.errorSubscribing");
  }
}

/**
 * Unsubscribe a browser from push notifications.
 * Deletes the subscription by endpoint + userId.
 */
export async function unsubscribePush(
  endpoint: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    if (!endpoint || typeof endpoint !== "string") {
      return { success: false, message: "push.invalidEndpoint" };
    }

    // Delete by composite unique (userId, endpoint) — ADR-015
    await prisma.webPushSubscription
      .delete({
        where: {
          userId_endpoint: {
            userId: user.id,
            endpoint,
          },
        },
      })
      .catch(() => {
        // Already deleted — not an error
      });

    return { success: true };
  } catch (error) {
    return handleError(error, "push.errorUnsubscribing");
  }
}

/**
 * Get the count of active push subscriptions for the current user.
 */
export async function getSubscriptionCount(): Promise<
  ActionResult<{ count: number }>
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    const count = await prisma.webPushSubscription.count({
      where: { userId: user.id },
    });

    return { success: true, data: { count } };
  } catch (error) {
    return handleError(error, "push.errorFetchingCount");
  }
}

/**
 * Rotate VAPID keys — generates a new key pair, deletes all subscriptions.
 * Returns the new public key so the client can re-subscribe.
 */
export async function rotateVapidKeysAction(): Promise<
  ActionResult<{ publicKey: string }>
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    const result = await rotateVapidKeys(user.id);
    return { success: true, data: { publicKey: result.publicKey } };
  } catch (error) {
    return handleError(error, "push.errorRotatingKeys");
  }
}

/**
 * Send a test push notification to all of the current user's subscriptions.
 * Rate limited: 1 test push per 60 seconds per user.
 */
export async function sendTestPush(): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    // Rate limit: 1 test per 60 seconds
    const rateCheck = checkTestPushRateLimit(user.id);
    if (!rateCheck.allowed) {
      return { success: false, message: "push.testRateLimited" };
    }

    // Check if push is available
    const channel = new PushChannel();
    const available = await channel.isAvailable(user.id);
    if (!available) {
      return { success: false, message: "push.noSubscriptions" };
    }

    // Send test notification through the PushChannel
    const result = await channel.dispatch(
      {
        userId: user.id,
        type: "module_unreachable", // Using a valid NotificationType
        message: "push.testBody",
        data: { test: true },
      },
      user.id,
    );

    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      message: "push.testFailed",
    };
  } catch (error) {
    return handleError(error, "push.testFailed");
  }
}
