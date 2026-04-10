/**
 * WebhookChannel — Webhook Notification Channel
 *
 * Implements NotificationChannel for delivering notifications to user-configured
 * webhook endpoints via HTTP POST with HMAC-SHA256 signing.
 *
 * Features:
 * - HMAC-SHA256 signature in X-Webhook-Signature header
 * - SSRF re-validation on every dispatch (URL resolution may change)
 * - Retry with backoff: 3 attempts at 1s, 5s, 30s
 * - Auto-deactivation after 5 consecutive failures
 * - In-app notification on delivery failure / deactivation
 *
 * Spec: specs/notification-dispatch.allium
 */

import "server-only";

import { createHmac } from "crypto";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { validateWebhookUrl } from "@/lib/url-validation";
import { t } from "@/i18n/server";
import { resolveUserLocale } from "@/lib/locale-resolver";
// Sprint 4 L-A (circular import extraction): import the enforced-writer
// helper directly from the leaf module, NOT from `channel-router.ts`. The
// old import path created a static import cycle because `channel-router.ts`
// also statically imports this file to wire channels on the singleton.
// See `src/lib/notifications/enforced-writer.ts` for the history.
import { prepareEnforcedNotification } from "@/lib/notifications/enforced-writer";
import type { NotificationType } from "@/models/notification.model";
import type {
  NotificationChannel,
  NotificationDraft,
  ChannelResult,
  WebhookPayload,
  WebhookDeliveryResult,
} from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RETRY_BACKOFFS_MS = [1_000, 5_000, 30_000];
const MAX_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const AUTO_DEACTIVATE_THRESHOLD = 5;
const USER_AGENT = "JobSync-Webhook/1.0";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA256 signature for a webhook payload.
 */
export function computeHmacSignature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Delay execution by the given milliseconds.
 * Returns a promise that resolves after the delay.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt a single HTTP POST to the webhook endpoint.
 */
async function attemptDelivery(
  url: string,
  payload: string,
  signature: string,
  eventType: string,
): Promise<WebhookDeliveryResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-Event": eventType,
        "User-Agent": USER_AGENT,
      },
      body: payload,
      signal: controller.signal,
      redirect: "manual",
    });

    clearTimeout(timeout);

    // Treat redirects as failure (SSRF bypass prevention)
    if (response.status >= 300 && response.status < 400) {
      return {
        success: false,
        statusCode: response.status,
        error: `Redirect not allowed (HTTP ${response.status})`,
        attemptNumber: 0,
      };
    }

    if (response.ok) {
      return { success: true, statusCode: response.status, attemptNumber: 0 };
    }

    return {
      success: false,
      statusCode: response.status,
      error: `HTTP ${response.status}`,
      attemptNumber: 0,
    };
  } catch (error) {
    clearTimeout(timeout);
    const message =
      error instanceof Error ? error.message : "Unknown fetch error";
    return { success: false, error: message, attemptNumber: 0 };
  }
}

/**
 * Deliver a webhook payload with retry logic.
 * Attempts up to MAX_ATTEMPTS times with increasing backoff.
 */
async function deliverWithRetry(
  url: string,
  payload: string,
  signature: string,
  eventType: string,
): Promise<WebhookDeliveryResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await attemptDelivery(url, payload, signature, eventType);
    result.attemptNumber = attempt + 1;

    if (result.success) {
      return result;
    }

    // If this is not the last attempt, wait before retrying
    if (attempt < MAX_ATTEMPTS - 1) {
      await delay(RETRY_BACKOFFS_MS[attempt]);
    }
  }

  // All attempts exhausted
  return {
    success: false,
    error: `All ${MAX_ATTEMPTS} delivery attempts failed`,
    attemptNumber: MAX_ATTEMPTS,
  };
}

/**
 * Create an in-app notification for webhook delivery failure.
 * Best-effort: logs errors but never throws.
 *
 * i18n — late-binding pattern (ADR-030):
 *   - `message` is resolved in the user's current locale at write time and
 *     kept as a backward-compat fallback for email/webhook channels and
 *     older clients that don't read structured fields.
 *   - Top-level `titleKey + titleParams` columns (ADR-030) carry the
 *     structured 5W+H metadata so the UI can re-render in the user's current
 *     locale at view time via formatNotificationTitle(), even if the user
 *     changes their locale after the notification was written. The same
 *     values are dual-written into the legacy `data.*` blob for backward
 *     compat during rollout.
 *
 * Preference gating (Sprint 2 H-A-04 / H-A-07):
 *   Routed through `prepareEnforcedNotification()` which calls shouldNotify()
 *   (global kill switch, perType, quiet hours, inApp channel gate) BEFORE
 *   the physical write. The physical `prisma.notification.create` stays
 *   here so that `scripts/check-notification-writers.sh`'s allowlist is
 *   unchanged — the invariant is enforced by the gate helper.
 */
async function notifyDeliveryFailed(
  userId: string,
  endpointUrl: string,
  eventType: string,
): Promise<void> {
  try {
    const locale = await resolveUserLocale(userId);
    // The sentence template still lives under the bare `webhook.*` key — it
    // powers the English `message` fallback stored on the row (used by
    // email/webhook/push channels and legacy readers). The late-bound title
    // key follows the project-wide `notifications.*.title` convention so it
    // sits alongside `notifications.moduleDeactivated.title` etc. and is
    // greppable with the other 5W+H writers.
    const template = t(locale, "webhook.deliveryFailed");
    const message = template
      .replace("{eventType}", eventType)
      .replace("{url}", endpointUrl);
    const titleKey = "notifications.webhook.deliveryFailed.title";
    const titleParams = { eventType, url: endpointUrl };

    const gated = await prepareEnforcedNotification({
      userId,
      type: "module_unreachable" satisfies NotificationType,
      message,
      titleKey,
      titleParams,
      actorType: "system",
      severity: "error",
      extraData: {
        endpointUrl,
        eventType,
        actorNameKey: "notifications.actor.system",
      },
    });
    if (gated.suppressed) return;
    await prisma.notification.create({ data: gated.row });
  } catch (error) {
    console.error("[WebhookChannel] Failed to create failure notification:", error);
  }
}

/**
 * Create an in-app notification for webhook endpoint auto-deactivation.
 * Best-effort: logs errors but never throws.
 *
 * i18n — late-binding pattern: see `notifyDeliveryFailed` for rationale.
 *
 * Preference gating (Sprint 2 H-A-04 / H-A-07): routed through
 * `prepareEnforcedNotification()` — see `notifyDeliveryFailed` for rationale.
 */
async function notifyEndpointDeactivated(
  userId: string,
  endpointUrl: string,
): Promise<void> {
  try {
    const locale = await resolveUserLocale(userId);
    // Same split as `notifyDeliveryFailed`: bare sentence key powers the
    // English fallback `message`; the titleKey follows the project-wide
    // `notifications.*.title` convention.
    const template = t(locale, "webhook.endpointDeactivated");
    const message = template.replace("{url}", endpointUrl);
    const titleKey = "notifications.webhook.endpointDeactivated.title";
    const titleParams = { url: endpointUrl };

    const gated = await prepareEnforcedNotification({
      userId,
      type: "module_unreachable" satisfies NotificationType,
      message,
      titleKey,
      titleParams,
      actorType: "system",
      severity: "warning",
      extraData: {
        endpointUrl,
        actorNameKey: "notifications.actor.system",
      },
    });
    if (gated.suppressed) return;
    await prisma.notification.create({ data: gated.row });
  } catch (error) {
    console.error("[WebhookChannel] Failed to create deactivation notification:", error);
  }
}

// ---------------------------------------------------------------------------
// WebhookChannel
// ---------------------------------------------------------------------------

export class WebhookChannel implements NotificationChannel {
  readonly name = "webhook";

  async dispatch(
    notification: NotificationDraft,
    userId: string,
  ): Promise<ChannelResult> {
    try {
      // Query active endpoints for this user that subscribe to this event type
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: { userId, active: true },
        select: {
          id: true,
          url: true,
          secret: true,
          iv: true,
          events: true,
          failureCount: true,
        },
      });

      if (endpoints.length === 0) {
        return { success: true, channel: this.name };
      }

      // Filter endpoints by event type subscription
      const matchingEndpoints = endpoints.filter((ep) => {
        try {
          const events: string[] = JSON.parse(ep.events);
          return events.includes(notification.type);
        } catch {
          return false;
        }
      });

      if (matchingEndpoints.length === 0) {
        return { success: true, channel: this.name };
      }

      // Build the webhook payload
      const payload: WebhookPayload = {
        event: notification.type,
        timestamp: new Date().toISOString(),
        data: notification.data ?? {},
      };
      const payloadJson = JSON.stringify(payload);

      // Deliver to all matching endpoints concurrently (M2: avoid sequential blocking)
      const deliveryResults = await Promise.allSettled(
        matchingEndpoints.map(async (endpoint) => {
          // Re-validate URL against SSRF on dispatch (URL resolution may change)
          const urlCheck = validateWebhookUrl(endpoint.url);
          if (!urlCheck.valid) {
            console.warn(
              `[WebhookChannel] SSRF blocked for endpoint ${endpoint.id}: ${urlCheck.error}`,
            );
            return { success: false, error: `SSRF blocked: ${endpoint.url}` };
          }

          // Decrypt the HMAC secret
          const decryptedSecret = decrypt(endpoint.secret, endpoint.iv);

          // Sign the payload
          const signature = computeHmacSignature(decryptedSecret, payloadJson);

          // Deliver with retry
          const result = await deliverWithRetry(
            endpoint.url,
            payloadJson,
            signature,
            notification.type,
          );

          if (result.success) {
            // Reset failure count on success (H3: include userId in where clause)
            if (endpoint.failureCount > 0) {
              await prisma.webhookEndpoint.update({
                where: { id: endpoint.id, userId },
                data: { failureCount: 0 },
              });
            }
            return { success: true };
          }

          // Atomic increment failure count (M3: prevent read-then-write race)
          const updated = await prisma.webhookEndpoint.update({
            where: { id: endpoint.id, userId },
            data: { failureCount: { increment: 1 } },
            select: { failureCount: true },
          });

          // Notify about delivery failure
          await notifyDeliveryFailed(userId, endpoint.url, notification.type);

          // Auto-deactivate after threshold (H3: include userId in where clause)
          if (updated.failureCount >= AUTO_DEACTIVATE_THRESHOLD) {
            await prisma.webhookEndpoint.update({
              where: { id: endpoint.id, userId },
              data: { active: false },
            });
            await notifyEndpointDeactivated(userId, endpoint.url);
          }

          return { success: false, error: result.error ?? `Delivery failed to ${endpoint.url}` };
        }),
      );

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
          const msg = settled.reason instanceof Error ? settled.reason.message : "Unknown error";
          console.error("[WebhookChannel] Error delivering to endpoint:", settled.reason);
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
      console.error("[WebhookChannel] Dispatch failed:", error);
      return { success: false, channel: this.name, error: errorMessage };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    // Check if user has any active webhook endpoints
    const count = await prisma.webhookEndpoint.count({
      where: { userId, active: true },
    });
    return count > 0;
  }
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export const _testHelpers = {
  attemptDelivery,
  deliverWithRetry,
  notifyDeliveryFailed,
  notifyEndpointDeactivated,
  delay,
  RETRY_BACKOFFS_MS,
  MAX_ATTEMPTS,
  FETCH_TIMEOUT_MS,
  AUTO_DEACTIVATE_THRESHOLD,
};
