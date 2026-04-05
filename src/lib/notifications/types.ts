/**
 * Notification Channel Types — Multi-Channel Architecture
 *
 * Defines the channel abstraction layer for notification delivery.
 * Channels: InApp (existing), Webhook (D1), Email (D2 future), Push (D3 future).
 *
 * Spec: specs/notification-dispatch.allium
 */

import type { NotificationType } from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Channel Abstraction
// ---------------------------------------------------------------------------

/**
 * A notification draft before channel dispatch.
 * Created by the NotificationDispatcher from domain events.
 */
export interface NotificationDraft {
  userId: string;
  type: NotificationType;
  message: string;
  moduleId?: string;
  automationId?: string;
  /** Structured data for webhook payloads */
  data?: Record<string, unknown>;
}

/**
 * Result of a single channel dispatch attempt.
 */
export interface ChannelResult {
  success: boolean;
  channel: string;
  error?: string;
}

/**
 * Interface that all notification channels must implement.
 * InAppChannel, WebhookChannel, EmailChannel, PushChannel.
 */
export interface NotificationChannel {
  /** Unique channel identifier — must match a key in NotificationPreferences.channels */
  readonly name: string;

  /**
   * Dispatch a notification through this channel.
   * Must not throw — returns ChannelResult with error details.
   */
  dispatch(notification: NotificationDraft, userId: string): Promise<ChannelResult>;

  /**
   * Check if this channel has the infrastructure to dispatch
   * (e.g., webhook has at least one active endpoint, email has SMTP configured).
   * Preference-level gating (channels.inApp, channels.webhook) is handled
   * by the ChannelRouter via shouldNotify() — this method checks infrastructure.
   */
  isAvailable(userId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Webhook-Specific Types
// ---------------------------------------------------------------------------

/**
 * The JSON payload sent to webhook endpoints.
 * Follows a standard webhook envelope pattern.
 */
export interface WebhookPayload {
  /** The notification type that triggered this webhook */
  event: string;
  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;
  /** Event-specific data */
  data: Record<string, unknown>;
}

/**
 * Result of a single webhook delivery attempt (for retry tracking).
 */
export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attemptNumber: number;
}

/**
 * Serialized webhook endpoint data (with secret masked for API responses).
 */
export interface WebhookEndpointDTO {
  id: string;
  url: string;
  /** Only the last 4 characters of the secret, prefixed with "whsec_****" */
  secretMask: string;
  events: NotificationType[];
  active: boolean;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Channel Configuration (extends NotificationPreferences.channels)
// ---------------------------------------------------------------------------

/**
 * Extended channel config that includes webhook.
 * This is the shape stored in UserSettings.settings.notifications.channels.
 */
export interface ChannelConfig {
  inApp: boolean;
  webhook: boolean;
  email: boolean;
  push: boolean;
}
