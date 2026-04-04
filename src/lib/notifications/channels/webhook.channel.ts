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

import { createHmac } from "crypto";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { validateWebhookUrl } from "@/lib/url-validation";
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
    });

    clearTimeout(timeout);

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
 */
async function notifyDeliveryFailed(
  userId: string,
  endpointUrl: string,
  eventType: string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: "module_unreachable" satisfies NotificationType,
        message: `Webhook delivery failed for event "${eventType}" to ${endpointUrl}`,
      },
    });
  } catch (error) {
    console.error("[WebhookChannel] Failed to create failure notification:", error);
  }
}

/**
 * Create an in-app notification for webhook endpoint auto-deactivation.
 * Best-effort: logs errors but never throws.
 */
async function notifyEndpointDeactivated(
  userId: string,
  endpointUrl: string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: "module_unreachable" satisfies NotificationType,
        message: `Webhook endpoint ${endpointUrl} deactivated due to repeated failures`,
      },
    });
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

      let anySuccess = false;
      const errors: string[] = [];

      // Deliver to each matching endpoint
      for (const endpoint of matchingEndpoints) {
        try {
          // Re-validate URL against SSRF on dispatch (URL resolution may change)
          const urlCheck = validateWebhookUrl(endpoint.url);
          if (!urlCheck.valid) {
            console.warn(
              `[WebhookChannel] SSRF blocked for endpoint ${endpoint.id}: ${urlCheck.error}`,
            );
            errors.push(`SSRF blocked: ${endpoint.url}`);
            continue;
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
            anySuccess = true;

            // Reset failure count on success
            if (endpoint.failureCount > 0) {
              await prisma.webhookEndpoint.update({
                where: { id: endpoint.id },
                data: { failureCount: 0 },
              });
            }
          } else {
            // Increment failure count
            const newFailureCount = endpoint.failureCount + 1;

            await prisma.webhookEndpoint.update({
              where: { id: endpoint.id },
              data: { failureCount: newFailureCount },
            });

            // Notify about delivery failure
            await notifyDeliveryFailed(userId, endpoint.url, notification.type);

            // Auto-deactivate after threshold
            if (newFailureCount >= AUTO_DEACTIVATE_THRESHOLD) {
              await prisma.webhookEndpoint.update({
                where: { id: endpoint.id },
                data: { active: false },
              });
              await notifyEndpointDeactivated(userId, endpoint.url);
            }

            errors.push(result.error ?? `Delivery failed to ${endpoint.url}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          console.error(
            `[WebhookChannel] Error delivering to endpoint ${endpoint.id}:`,
            error,
          );
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
