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
import { encrypt, decrypt } from "@/lib/encryption";
import { getOrCreateVapidKeys, rotateVapidKeys, resolveVapidSubject } from "@/lib/push/vapid";
import { checkTestPushRateLimit } from "@/lib/push/rate-limit";
import { resolveUserLocale } from "@/lib/locale-resolver";
import { t } from "@/i18n/server";
import { channelRouter } from "@/lib/notifications/channel-router";
import { ActionResult } from "@/models/actionResult";
import webpush from "web-push";

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

/** Input length limits for subscription fields (prevent oversized payloads) */
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_P256DH_LENGTH = 256;
const MAX_AUTH_LENGTH = 128;

/** Push send timeout in milliseconds */
const PUSH_TIMEOUT_MS = 10_000;

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

    // Input length validation (prevent oversized payloads)
    if (input.endpoint.length > MAX_ENDPOINT_LENGTH) {
      return { success: false, message: "push.invalidEndpoint" };
    }
    if (input.keys.p256dh.length > MAX_P256DH_LENGTH) {
      return { success: false, message: "push.invalidKeys" };
    }
    if (input.keys.auth.length > MAX_AUTH_LENGTH) {
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

    // Sprint 4 L-A Sprint-3-follow-up: a new subscription flips the user
    // from "push unavailable" to "push available" (or adds yet another
    // device). Drop the cached `isAvailable` result so the next dispatch
    // picks it up instead of waiting for the 30s ISAVAILABLE_CACHE_TTL_MS
    // window. Spec: specs/notification-dispatch.allium invariant
    // AvailabilityCacheTtl.
    channelRouter.invalidateAvailability(user.id, "push");

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

    // Sprint 4 L-A Sprint-3-follow-up: deleting a subscription can flip
    // the user from "push available" to "push unavailable" when this was
    // their last device. Drop the cache so the next dispatch stops
    // routing to a now-empty subscription set.
    channelRouter.invalidateAvailability(user.id, "push");

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
 *
 * Sends directly via web-push instead of through PushChannel.dispatch()
 * to avoid double-charging rate limits (test rate limit + dispatch rate limit).
 */
export async function sendTestPush(): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    // Rate limit: 1 test per 60 seconds (only rate limit for test pushes)
    const rateCheck = checkTestPushRateLimit(user.id);
    if (!rateCheck.allowed) {
      return { success: false, message: "push.testRateLimited" };
    }

    // Load VAPID keys
    const vapidConfig = await prisma.vapidConfig.findUnique({
      where: { userId: user.id },
    });
    if (!vapidConfig) {
      return { success: false, message: "push.noSubscriptions" };
    }

    // Load subscriptions (ADR-015: userId in where)
    const subscriptions = await prisma.webPushSubscription.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        iv: true,
      },
    });
    if (subscriptions.length === 0) {
      return { success: false, message: "push.noSubscriptions" };
    }

    // Decrypt VAPID private key
    let vapidPrivateKey: string;
    try {
      vapidPrivateKey = decrypt(vapidConfig.privateKey, vapidConfig.iv);
    } catch {
      return { success: false, message: "push.testFailed" };
    }

    // Resolve user locale and translate the test message body
    const locale = await resolveUserLocale(user.id);
    const translatedBody = t(locale, "settings.pushTestBody");

    // Resolve VAPID subject
    const vapidSubject = await resolveVapidSubject(user.id);

    // Build payload with "vacancy_promoted" type — semantically neutral,
    // consistent with SMTP test approach (no dedicated test type exists)
    const payload = JSON.stringify({
      title: "JobSync",
      body: translatedBody,
      url: "/dashboard",
      tag: "vacancy_promoted",
    });

    // Send to all subscriptions concurrently
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const ivParts = sub.iv.split("|");
        const ivP256dh = ivParts[0];
        const ivAuth = ivParts[1] ?? ivParts[0];

        const p256dh = decrypt(sub.p256dh, ivP256dh);
        const auth = decrypt(sub.auth, ivAuth);

        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh, auth } },
          payload,
          {
            vapidDetails: {
              subject: vapidSubject,
              publicKey: vapidConfig.publicKey,
              privateKey: vapidPrivateKey,
            },
            timeout: PUSH_TIMEOUT_MS,
          },
        );
      }),
    );

    const anySuccess = results.some((r) => r.status === "fulfilled");
    if (anySuccess) {
      return { success: true };
    }

    return { success: false, message: "push.testFailed" };
  } catch (error) {
    return handleError(error, "push.testFailed");
  }
}
