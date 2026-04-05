/**
 * EmailChannel — Email Notification Channel
 *
 * Implements NotificationChannel for delivering notifications via SMTP email
 * using nodemailer. Each user configures their own SMTP server (SmtpConfig).
 *
 * Features:
 * - Per-user SMTP configuration (host, port, auth, TLS)
 * - Rate limiting: 10 emails/minute per user
 * - SSRF validation on SMTP host before every dispatch
 * - TLS enforcement (STARTTLS or implicit TLS) with minimum TLSv1.2
 * - Locale-aware HTML+text email templates
 * - Encrypted password storage (AES-256-GCM)
 *
 * Security:
 * - Decrypted passwords never leave this module
 * - SMTP host re-validated on every dispatch (host resolution may change)
 * - rejectUnauthorized: true (no self-signed certs)
 */

import nodemailer from "nodemailer";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { validateSmtpHost } from "@/lib/smtp-validation";
import { checkEmailRateLimit } from "@/lib/email-rate-limit";
import { renderEmailTemplate } from "@/lib/email/templates";
import { t } from "@/i18n/server";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/locales";
import type { UserSettingsData } from "@/models/userSettings.model";
import type {
  NotificationChannel,
  NotificationDraft,
  ChannelResult,
} from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEND_TIMEOUT_MS = 30_000; // 30s timeout for SMTP operations

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the user's preferred locale from their settings.
 * Falls back to DEFAULT_LOCALE ("en") if settings are unavailable.
 */
async function resolveUserLocale(userId: string): Promise<string> {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return DEFAULT_LOCALE;
    const parsed: UserSettingsData = JSON.parse(row.settings);
    const locale = parsed.display?.locale;
    if (locale && isValidLocale(locale)) return locale;
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Resolve the user's email address from SmtpConfig.fromAddress.
 */
async function resolveRecipientEmail(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// EmailChannel
// ---------------------------------------------------------------------------

export class EmailChannel implements NotificationChannel {
  readonly name = "email";

  async dispatch(
    notification: NotificationDraft,
    userId: string,
  ): Promise<ChannelResult> {
    try {
      // 1. Rate limit check (10/min per user)
      const rateCheck = checkEmailRateLimit(userId);
      if (!rateCheck.allowed) {
        console.warn(`[EmailChannel] Rate limited for user ${userId}`);
        return { success: false, channel: this.name, error: "Rate limited" };
      }

      // 2. Load SmtpConfig for this user
      const config = await prisma.smtpConfig.findFirst({
        where: { userId, active: true },
      });
      if (!config) {
        return { success: true, channel: this.name }; // No config = skip silently
      }

      // 3. Decrypt password
      let decryptedPassword: string;
      try {
        decryptedPassword = decrypt(config.password, config.iv);
      } catch (err) {
        console.error("[EmailChannel] Failed to decrypt SMTP password:", err);
        return { success: false, channel: this.name, error: "Decryption failed" };
      }

      // 4. Validate SMTP host (SSRF re-validation on every dispatch)
      const hostCheck = validateSmtpHost(config.host);
      if (!hostCheck.valid) {
        console.warn(
          `[EmailChannel] SSRF blocked for SMTP host ${config.host}: ${hostCheck.error}`,
        );
        return { success: false, channel: this.name, error: `SSRF blocked: ${hostCheck.error}` };
      }

      // 5. Resolve user locale
      const locale = await resolveUserLocale(userId);

      // 6. Resolve recipient email (user's account email)
      const recipientEmail = await resolveRecipientEmail(userId);
      if (!recipientEmail) {
        console.warn("[EmailChannel] No recipient email found for user");
        return { success: false, channel: this.name, error: "No recipient email" };
      }

      // 7. Render template
      const { subject, html, text } = renderEmailTemplate(
        notification.type,
        notification.data ?? {},
        locale,
      );

      // 8. Create nodemailer transporter with TLS enforcement
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465, // true for 465 (implicit TLS), false for others (STARTTLS)
        auth: {
          user: config.username,
          pass: decryptedPassword,
        },
        tls: {
          rejectUnauthorized: true, // reject self-signed certs
          minVersion: "TLSv1.2",
        },
        requireTLS: config.tlsRequired, // enforce STARTTLS on non-465 ports
        connectionTimeout: SEND_TIMEOUT_MS,
        greetingTimeout: SEND_TIMEOUT_MS,
        socketTimeout: SEND_TIMEOUT_MS,
      });

      // 9. Send email
      const fullSubject = `[JobSync] ${subject}`;

      await transporter.sendMail({
        from: config.fromAddress,
        to: recipientEmail,
        subject: fullSubject,
        html,
        text,
      });

      return { success: true, channel: this.name };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[EmailChannel] Dispatch failed:", error);
      return { success: false, channel: this.name, error: errorMessage };
    }
  }

  async isAvailable(userId: string): Promise<boolean> {
    // Check if user has an active SmtpConfig
    const count = await prisma.smtpConfig.count({
      where: { userId, active: true },
    });
    return count > 0;
  }
}

// ---------------------------------------------------------------------------
// Test Helpers (exported for test access)
// ---------------------------------------------------------------------------

export const _testHelpers = {
  resolveUserLocale,
  resolveRecipientEmail,
  SEND_TIMEOUT_MS,
};
