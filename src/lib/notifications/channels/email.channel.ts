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

import "server-only";

import { decrypt } from "@/lib/encryption";
import { validateSmtpHost } from "@/lib/smtp-validation";
import { checkEmailRateLimit } from "@/lib/email-rate-limit";
import { renderEmailTemplate } from "@/lib/email/templates";
import { createSmtpTransporter } from "@/lib/email/transport";
import type { DispatchContext } from "../dispatch-context";
import type {
  NotificationChannel,
  NotificationDraft,
  ChannelResult,
} from "../types";

// ---------------------------------------------------------------------------
// EmailChannel
// ---------------------------------------------------------------------------

export class EmailChannel implements NotificationChannel {
  readonly name = "email";

  async dispatch(
    notification: NotificationDraft,
    ctx: DispatchContext,
  ): Promise<ChannelResult> {
    try {
      // 1. Rate limit check (10/min per user)
      const rateCheck = checkEmailRateLimit(ctx.userId);
      if (!rateCheck.allowed) {
        console.warn(`[EmailChannel] Rate limited for user ${ctx.userId}`);
        return { success: false, channel: this.name, error: "Rate limited" };
      }

      // 2. Read SMTP config from context snapshot
      const config = ctx.smtp;
      if (!config) {
        return { success: false, channel: this.name, error: "No active SMTP configuration" };
      }

      // 3. Decrypt password
      let decryptedPassword: string;
      try {
        decryptedPassword = await decrypt(config.password, config.iv);
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

      // 5. Locale from context snapshot
      const locale = ctx.locale;

      // 6. Recipient email from context snapshot
      const recipientEmail = ctx.userEmail;
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
      const transporter = createSmtpTransporter({
        host: config.host,
        port: config.port,
        username: config.username,
        decryptedPassword,
        tlsRequired: config.tlsRequired,
      });

      // 9. Send email
      const fullSubject = `[JobSync] ${subject}`;

      try {
        await transporter.sendMail({
          from: config.fromAddress,
          to: recipientEmail,
          subject: fullSubject,
          html,
          text,
        });
      } finally {
        transporter.close();
      }

      return { success: true, channel: this.name };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[EmailChannel] Dispatch failed:", error);
      return { success: false, channel: this.name, error: errorMessage };
    }
  }
}

// ---------------------------------------------------------------------------
// Test Helpers (exported for test access)
// ---------------------------------------------------------------------------

export const _testHelpers = {};
