import "server-only";

/**
 * PushChannel — Browser Push Notification Channel
 *
 * Implements NotificationChannel for delivering notifications via Web Push
 * (VAPID protocol) to subscribed browsers using the web-push library.
 *
 * Features:
 * - Per-user VAPID key pairs (encrypted private key at rest)
 * - Concurrent delivery to all user subscriptions (Promise.allSettled)
 * - Stale subscription cleanup: 410 Gone -> auto-delete
 * - Rate limiting: 20 pushes per minute per user
 * - VAPID subject derived from user's SMTP fromAddress (fallback: noreply@jobsync.local)
 *
 * Security:
 * - VAPID private keys decrypted only for the duration of the send
 * - Subscription keys (p256dh, auth) decrypted only at send time
 * - All Prisma queries include userId (ADR-015 IDOR protection)
 */

import webpush, { WebPushError } from "web-push";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { checkPushDispatchRateLimit } from "@/lib/push/rate-limit";
import { resolveVapidSubject } from "@/lib/push/vapid";
import type {
  NotificationChannel,
  NotificationDraft,
  ChannelResult,
} from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PUSH_TIMEOUT_MS = 10_000;

/**
 * Push notification title — the app name "JobSync" is locale-invariant
 * (proper noun / brand name), so a constant is used instead of i18n.
 */
const PUSH_TITLE = "JobSync";

// ---------------------------------------------------------------------------
// PushChannel
// ---------------------------------------------------------------------------

export class PushChannel implements NotificationChannel {
  readonly name = "push";

  async dispatch(
    notification: NotificationDraft,
    userId: string,
  ): Promise<ChannelResult> {
    try {
      // 1. Rate limit check (20/min per user)
      const rateCheck = checkPushDispatchRateLimit(userId);
      if (!rateCheck.allowed) {
        console.warn(`[PushChannel] Rate limited for user ${userId}`);
        return { success: false, channel: this.name, error: "Rate limited" };
      }

      // 2. Load VAPID keys for user
      const vapidConfig = await prisma.vapidConfig.findUnique({
        where: { userId },
      });
      if (!vapidConfig) {
        return { success: false, channel: this.name, error: "No VAPID keys configured" };
      }

      // 3. Load all subscriptions for user
      const subscriptions = await prisma.webPushSubscription.findMany({
        where: { userId },
        select: {
          id: true,
          endpoint: true,
          p256dh: true,
          auth: true,
          iv: true,
        },
      });

      if (subscriptions.length === 0) {
        return { success: false, channel: this.name, error: "No push subscriptions" };
      }

      // 4. Decrypt VAPID private key
      let vapidPrivateKey: string;
      try {
        vapidPrivateKey = decrypt(vapidConfig.privateKey, vapidConfig.iv);
      } catch (err) {
        console.error("[PushChannel] Failed to decrypt VAPID private key:", err);
        return {
          success: false,
          channel: this.name,
          error: "VAPID key decryption failed",
        };
      }

      // 5. Resolve VAPID subject
      const vapidSubject = await resolveVapidSubject(userId);

      // 6. Build push payload
      const payload = JSON.stringify({
        title: PUSH_TITLE,
        body: notification.message,
        url: "/dashboard",
        tag: notification.type,
      });

      // 7. Deliver to all subscriptions concurrently
      const deliveryResults = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          // Decrypt subscription keys
          // p256dh and auth are encrypted separately, each with their own iv
          // stored as "ivP256dh|ivAuth" in the iv field
          const ivParts = sub.iv.split("|");
          const ivP256dh = ivParts[0];
          const ivAuth = ivParts[1] ?? ivParts[0]; // fallback for single-iv records

          let p256dh: string;
          let auth: string;
          try {
            p256dh = decrypt(sub.p256dh, ivP256dh);
            auth = decrypt(sub.auth, ivAuth);
          } catch (err) {
            console.error(
              `[PushChannel] Failed to decrypt subscription keys for ${sub.id}:`,
              err,
            );
            return { success: false, error: "Subscription key decryption failed" };
          }

          const pushSubscription: webpush.PushSubscription = {
            endpoint: sub.endpoint,
            keys: { p256dh, auth },
          };

          try {
            await webpush.sendNotification(pushSubscription, payload, {
              vapidDetails: {
                subject: vapidSubject,
                publicKey: vapidConfig.publicKey,
                privateKey: vapidPrivateKey,
              },
              timeout: PUSH_TIMEOUT_MS,
            });
            return { success: true };
          } catch (err) {
            if (err instanceof WebPushError) {
              // 401/403: VAPID auth failure — transient, preserve subscription
              if (err.statusCode === 401 || err.statusCode === 403) {
                console.warn(
                  `[PushChannel] VAPID auth failure (${err.statusCode}) for ${sub.endpoint} — subscription preserved`,
                );
                return {
                  success: false,
                  error: `VAPID auth failure (${err.statusCode})`,
                };
              }

              // 404/410: subscription is gone or not found — clean it up
              if (err.statusCode === 404 || err.statusCode === 410) {
                await prisma.webPushSubscription
                  .delete({
                    where: { id: sub.id, userId },
                  })
                  .catch(() => {
                    // Already deleted or race condition — ignore
                  });

                return {
                  success: false,
                  error: `Subscription expired (${err.statusCode})`,
                };
              }
            }

            const message =
              err instanceof Error ? err.message : "Unknown push error";
            console.error(
              `[PushChannel] Push to ${sub.endpoint} failed:`,
              message,
            );
            return { success: false, error: message };
          }
        }),
      );

      // 8. Aggregate results
      const errors: string[] = [];
      let anySuccess = false;

      for (const settled of deliveryResults) {
        if (settled.status === "fulfilled") {
          if (settled.value.success) {
            anySuccess = true;
          } else if (settled.value.error) {
            errors.push(settled.value.error);
          }
        } else {
          const msg =
            settled.reason instanceof Error
              ? settled.reason.message
              : "Unknown error";
          console.error("[PushChannel] Unexpected error:", settled.reason);
          errors.push(msg);
        }
      }

      if (anySuccess || errors.length === 0) {
        return { success: true, channel: this.name };
      }

      return {
        success: false,
        channel: this.name,
        error: errors.join("; "),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[PushChannel] Dispatch failed:", error);
      return { success: false, channel: this.name, error: errorMessage };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    try {
      // Has VAPID keys AND at least one subscription
      const [vapid, subCount] = await Promise.all([
        prisma.vapidConfig.findUnique({ where: { userId } }),
        prisma.webPushSubscription.count({ where: { userId } }),
      ]);
      return !!vapid && subCount > 0;
    } catch (error) {
      console.error("[PushChannel] isAvailable check failed:", error);
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Test Helpers (exported for test access)
// ---------------------------------------------------------------------------

export const _testHelpers = {
  resolveVapidSubject,
  PUSH_TIMEOUT_MS,
};
