/**
 * DispatchContext — Pre-fetched snapshot of all per-user channel data
 *
 * PERF-3 refactoring: replaces per-channel DB queries with a single
 * `buildDispatchContext(userId)` call that runs 6 parallel Prisma reads.
 * The resulting immutable snapshot is threaded through `ChannelRouter.route()`
 * and into each channel's `dispatch(draft, ctx)` call.
 *
 * Benefits:
 * - Eliminates N+1 DB reads per dispatch (was: 1 per channel isAvailable +
 *   1-3 per channel dispatch, now: 1 upfront batch)
 * - Removes the 30s TTL `isAvailable` cache and its invalidation surface
 * - Makes channel dispatch pure-functional over a snapshot (easier to test)
 *
 * Snapshot fields carry encrypted values (password, privateKey, p256dh, auth,
 * secret) — decryption happens inside the channel at send time, never here.
 */

import "server-only";

import prisma from "@/lib/db";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@/models/notification.model";
import type { NotificationPreferences } from "@/models/notification.model";
import type { UserSettingsData } from "@/models/userSettings.model";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/locales";

// ---------------------------------------------------------------------------
// Snapshot Types
// ---------------------------------------------------------------------------

export interface SmtpConfigSnapshot {
  readonly id: string;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;  // AES-encrypted
  readonly iv: string;
  readonly fromAddress: string;
  readonly tlsRequired: boolean;
}

export interface VapidConfigSnapshot {
  readonly publicKey: string;
  readonly privateKey: string;  // AES-encrypted
  readonly iv: string;
}

export interface PushSubscriptionSnapshot {
  readonly id: string;
  readonly endpoint: string;
  readonly p256dh: string;  // AES-encrypted
  readonly auth: string;    // AES-encrypted
  readonly iv: string;      // "ivP256dh|ivAuth"
}

export interface WebhookEndpointSnapshot {
  readonly id: string;
  readonly url: string;
  readonly secret: string;  // AES-encrypted
  readonly iv: string;
  readonly events: string;  // JSON array
  readonly failureCount: number;
}

// ---------------------------------------------------------------------------
// DispatchContext
// ---------------------------------------------------------------------------

export interface DispatchContext {
  readonly userId: string;
  readonly preferences: NotificationPreferences;
  readonly locale: string;
  readonly userEmail: string | null;
  readonly smtp: SmtpConfigSnapshot | null;
  readonly vapid: VapidConfigSnapshot | null;
  readonly pushSubscriptions: PushSubscriptionSnapshot[];
  readonly webhookEndpoints: WebhookEndpointSnapshot[];
  readonly emailAvailable: boolean;
  readonly pushAvailable: boolean;
  readonly webhookAvailable: boolean;
  readonly inAppAvailable: true;
  readonly vapidSubject: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_VAPID_SUBJECT = "mailto:noreply@jobsync.local";

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a complete DispatchContext for the given user by running 6 parallel
 * Prisma queries. The result is an immutable snapshot that captures all data
 * needed to route and dispatch notifications across all channels.
 *
 * This replaces:
 * - `resolveUserSettings()` in notification-dispatcher.ts
 * - `isAvailable()` on each channel
 * - Per-dispatch DB reads inside EmailChannel, PushChannel, WebhookChannel
 *
 * All Prisma queries include `userId` in the where clause (ADR-015).
 */
export async function buildDispatchContext(
  userId: string,
): Promise<DispatchContext> {
  const [
    userSettingsRow,
    userRow,
    smtpRow,
    vapidRow,
    pushSubscriptions,
    webhookEndpoints,
  ] = await Promise.all([
    prisma.userSettings
      .findUnique({ where: { userId } })
      .catch(() => null),
    prisma.user
      .findUnique({
        where: { id: userId },
        select: { email: true },
      })
      .catch(() => null),
    prisma.smtpConfig
      .findFirst({
        where: { userId, active: true },
        select: {
          id: true,
          host: true,
          port: true,
          username: true,
          password: true,
          iv: true,
          fromAddress: true,
          tlsRequired: true,
        },
      })
      .catch(() => null),
    prisma.vapidConfig
      .findUnique({
        where: { userId },
        select: {
          publicKey: true,
          privateKey: true,
          iv: true,
        },
      })
      .catch(() => null),
    prisma.webPushSubscription
      .findMany({
        where: { userId },
        select: {
          id: true,
          endpoint: true,
          p256dh: true,
          auth: true,
          iv: true,
        },
      })
      .catch(() => [] as never[]),
    prisma.webhookEndpoint
      .findMany({
        where: { userId, active: true },
        select: {
          id: true,
          url: true,
          secret: true,
          iv: true,
          events: true,
          failureCount: true,
        },
      })
      .catch(() => [] as never[]),
  ]);

  // Resolve preferences + locale from UserSettings JSON
  let preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
  let locale: string = DEFAULT_LOCALE;

  if (userSettingsRow) {
    try {
      const parsed: UserSettingsData = JSON.parse(userSettingsRow.settings);
      preferences = parsed.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES;
      const rawLocale = parsed.display?.locale;
      locale = rawLocale && isValidLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
    } catch {
      // Malformed JSON — keep defaults
    }
  }

  // Build SMTP snapshot
  const smtp: SmtpConfigSnapshot | null = smtpRow
    ? {
        id: smtpRow.id,
        host: smtpRow.host,
        port: smtpRow.port,
        username: smtpRow.username,
        password: smtpRow.password,
        iv: smtpRow.iv,
        fromAddress: smtpRow.fromAddress,
        tlsRequired: smtpRow.tlsRequired,
      }
    : null;

  // Build VAPID snapshot
  const vapid: VapidConfigSnapshot | null = vapidRow
    ? {
        publicKey: vapidRow.publicKey,
        privateKey: vapidRow.privateKey,
        iv: vapidRow.iv,
      }
    : null;

  // Derive availability flags
  const emailAvailable = smtp !== null;
  const pushAvailable = vapid !== null && pushSubscriptions.length > 0;
  const webhookAvailable = webhookEndpoints.length > 0;

  // Derive VAPID subject
  const vapidSubject = smtp?.fromAddress
    ? `mailto:${smtp.fromAddress}`
    : DEFAULT_VAPID_SUBJECT;

  return {
    userId,
    preferences,
    locale,
    userEmail: userRow?.email ?? null,
    smtp,
    vapid,
    pushSubscriptions,
    webhookEndpoints,
    emailAvailable,
    pushAvailable,
    webhookAvailable,
    inAppAvailable: true,
    vapidSubject,
  };
}
