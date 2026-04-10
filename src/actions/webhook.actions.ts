"use server";

import { randomBytes } from "crypto";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { encrypt } from "@/lib/encryption";
import { ActionResult } from "@/models/actionResult";
import { validateWebhookUrl } from "@/lib/url-validation";
import { channelRouter } from "@/lib/notifications/channel-router";
import type { NotificationType } from "@/models/notification.model";
import type { WebhookEndpointDTO } from "@/lib/notifications/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ENDPOINTS_PER_USER = 10;
const SECRET_LENGTH = 32; // 256-bit HMAC secret

/** Valid notification types for webhook event filtering */
const VALID_NOTIFICATION_TYPES: NotificationType[] = [
  "module_deactivated",
  "module_reactivated",
  "module_unreachable",
  "cb_escalation",
  "consecutive_failures",
  "auth_failure",
  "vacancy_promoted",
  "vacancy_batch_staged",
  "bulk_action_completed",
  "retention_completed",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSecret(): string {
  return `whsec_${randomBytes(SECRET_LENGTH).toString("hex")}`;
}

function maskSecret(secret: string): string {
  // Show "whsec_****" + last 4 chars
  if (secret.length <= 10) return "whsec_****";
  return `whsec_****${secret.slice(-4)}`;
}

function validateEvents(events: string[]): { valid: boolean; error?: string } {
  if (!Array.isArray(events) || events.length === 0) {
    return { valid: false, error: "webhook.eventsLabel" };
  }
  for (const event of events) {
    if (!VALID_NOTIFICATION_TYPES.includes(event as NotificationType)) {
      return { valid: false, error: "webhook.urlInvalid" };
    }
  }
  return { valid: true };
}

function toDTO(endpoint: {
  id: string;
  url: string;
  events: string;
  active: boolean;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}): WebhookEndpointDTO {
  let events: NotificationType[] = [];
  try {
    events = JSON.parse(endpoint.events) as NotificationType[];
  } catch {
    events = [];
  }
  return {
    id: endpoint.id,
    url: endpoint.url,
    secretMask: "whsec_****",
    events,
    active: endpoint.active,
    failureCount: endpoint.failureCount,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Create a new webhook endpoint.
 * Returns the plaintext secret once — it cannot be retrieved after creation.
 */
export async function createWebhookEndpoint(
  url: string,
  events: string[],
): Promise<ActionResult<{ endpoint: WebhookEndpointDTO; secret: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    // Validate URL with SSRF check
    const urlResult = validateWebhookUrl(url);
    if (!urlResult.valid) {
      return { success: false, message: urlResult.error ?? "webhook.urlInvalid" };
    }

    // Validate events
    const eventsResult = validateEvents(events);
    if (!eventsResult.valid) {
      return { success: false, message: eventsResult.error ?? "webhook.urlInvalid" };
    }

    // Check endpoint limit
    const count = await prisma.webhookEndpoint.count({
      where: { userId: user.id },
    });
    if (count >= MAX_ENDPOINTS_PER_USER) {
      return { success: false, message: "webhook.maxEndpoints" };
    }

    // Generate and encrypt secret
    const plaintextSecret = generateSecret();
    const { encrypted, iv } = encrypt(plaintextSecret);

    // Create endpoint
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        userId: user.id,
        url,
        secret: encrypted,
        iv,
        events: JSON.stringify(events),
        active: true,
        failureCount: 0,
      },
    });

    // Sprint 4 L-A Sprint-3-follow-up: drop the cached `isAvailable` result
    // so the next dispatch sees the new endpoint instead of waiting ≤30s
    // for the ISAVAILABLE_CACHE_TTL_MS window to expire. Spec:
    // specs/notification-dispatch.allium invariant AvailabilityCacheTtl
    // explicitly names this hook as the Settings-write escape valve.
    channelRouter.invalidateAvailability(user.id, "webhook");

    return {
      success: true,
      data: {
        endpoint: toDTO(endpoint),
        secret: plaintextSecret,
      },
    };
  } catch (error) {
    return handleError(error, "errors.createWebhook");
  }
}

/**
 * List all webhook endpoints for the current user.
 * Secrets are masked in the response.
 */
export async function listWebhookEndpoints(): Promise<ActionResult<WebhookEndpointDTO[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: endpoints.map(toDTO),
    };
  } catch (error) {
    return handleError(error, "errors.fetchWebhooks");
  }
}

/**
 * Get a single webhook endpoint by ID.
 */
export async function getWebhookEndpoint(
  id: string,
): Promise<ActionResult<WebhookEndpointDTO>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!endpoint) {
      return { success: false, message: "webhook.notFound", errorCode: "NOT_FOUND" };
    }

    return { success: true, data: toDTO(endpoint) };
  } catch (error) {
    return handleError(error, "errors.fetchWebhook");
  }
}

/**
 * Update a webhook endpoint (URL, events, active status).
 * If URL changes, re-validates with SSRF check.
 */
export async function updateWebhookEndpoint(
  id: string,
  data: { url?: string; events?: string[]; active?: boolean },
): Promise<ActionResult<WebhookEndpointDTO>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    // Verify ownership with userId (ADR-015)
    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return { success: false, message: "webhook.notFound", errorCode: "NOT_FOUND" };
    }

    // Validate URL if changed
    if (data.url !== undefined) {
      const urlResult = validateWebhookUrl(data.url);
      if (!urlResult.valid) {
        return { success: false, message: urlResult.error ?? "webhook.urlInvalid" };
      }
    }

    // Validate events if changed
    if (data.events !== undefined) {
      const eventsResult = validateEvents(data.events);
      if (!eventsResult.valid) {
        return { success: false, message: eventsResult.error ?? "webhook.urlInvalid" };
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.url !== undefined) updateData.url = data.url;
    if (data.events !== undefined) updateData.events = JSON.stringify(data.events);
    if (data.active !== undefined) {
      updateData.active = data.active;
      // Reset failure count when re-activating
      if (data.active) updateData.failureCount = 0;
    }

    // Use updateMany with userId to prevent IDOR (ADR-015)
    // Cannot use update() with compound where since there is no @@unique([id, userId])
    await prisma.webhookEndpoint.updateMany({
      where: { id, userId: user.id },
      data: updateData,
    });

    // Re-fetch to return updated DTO (updateMany doesn't return the record)
    const updated = await prisma.webhookEndpoint.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        failureCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!updated) {
      return { success: false, message: "webhook.notFound", errorCode: "NOT_FOUND" };
    }

    // Sprint 4 L-A Sprint-3-follow-up: an update can flip `active`, change
    // the event list, or relocate the URL — any of which changes what the
    // next dispatch should see. Drop the cached `isAvailable` result so
    // the change is visible immediately instead of after the 30s TTL.
    channelRouter.invalidateAvailability(user.id, "webhook");

    return { success: true, data: toDTO(updated) };
  } catch (error) {
    return handleError(error, "errors.updateWebhook");
  }
}

/**
 * Delete a webhook endpoint.
 */
export async function deleteWebhookEndpoint(
  id: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    // Verify ownership with userId (ADR-015)
    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return { success: false, message: "webhook.notFound", errorCode: "NOT_FOUND" };
    }

    // Use deleteMany with userId to prevent IDOR (ADR-015)
    await prisma.webhookEndpoint.deleteMany({
      where: { id, userId: user.id },
    });

    // Sprint 4 L-A Sprint-3-follow-up: dropping an endpoint can flip the
    // user from "webhook available" to "webhook unavailable" when this
    // was their last active row. Drop the cache so the next dispatch
    // doesn't keep routing to a zero-endpoint user for up to 30s.
    channelRouter.invalidateAvailability(user.id, "webhook");

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.deleteWebhook");
  }
}
