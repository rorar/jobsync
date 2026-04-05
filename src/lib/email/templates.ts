import "server-only";

/**
 * Email Templates — Renders HTML/text email content for notification dispatch.
 *
 * Each NotificationType maps to a localized subject line and body.
 * Uses inline styles (email clients do not support external CSS).
 * Uses i18n server `t()` for all user-visible strings.
 */

import { t } from "@/i18n/server";
import type { NotificationType } from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Subject key map — maps NotificationType to i18n subject key
// ---------------------------------------------------------------------------

const SUBJECT_KEYS: Record<NotificationType, string> = {
  module_deactivated: "email.subject.module_deactivated",
  module_reactivated: "email.subject.module_reactivated",
  module_unreachable: "email.subject.module_unreachable",
  cb_escalation: "email.subject.cb_escalation",
  consecutive_failures: "email.subject.consecutive_failures",
  auth_failure: "email.subject.auth_failure",
  vacancy_promoted: "email.subject.vacancy_promoted",
  vacancy_batch_staged: "email.subject.vacancy_batch_staged",
  bulk_action_completed: "email.subject.bulk_action_completed",
  retention_completed: "email.subject.retention_completed",
  job_status_changed: "email.subject.job_status_changed",
};

// ---------------------------------------------------------------------------
// HTML Layout
// ---------------------------------------------------------------------------

function wrapHtml(header: string, body: string, footer: string, locale: string): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(header)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:20px 24px;">
              <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(header)}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:24px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e4e4e7;background-color:#fafafa;">
              <p style="margin:0;color:#636363;font-size:12px;line-height:1.5;">${escapeHtml(footer)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strip control characters from plain-text content.
 * Preserves \t (0x09), \n (0x0A), \r (0x0D) which are valid in email bodies.
 */
function sanitizePlainText(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render an email template for a given notification type.
 *
 * @param type - The NotificationType triggering the email
 * @param data - Structured event data (same as NotificationDraft.data)
 * @param locale - User's preferred locale (en, de, fr, es)
 * @returns Rendered email with subject, HTML body, and plain text fallback
 */
export function renderEmailTemplate(
  type: NotificationType,
  data: Record<string, unknown>,
  locale: string,
): RenderedEmail {
  const header = t(locale, "email.header");
  const footer = t(locale, "email.footer");
  const greeting = t(locale, "email.greeting");
  const subjectKey = SUBJECT_KEYS[type];
  const subject = t(locale, subjectKey);

  // Build the notification message using the same i18n keys as in-app notifications
  const message = buildNotificationMessage(type, data, locale);

  const htmlBody = `
    <p style="margin:0 0 16px;color:#27272a;font-size:14px;line-height:1.6;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;color:#27272a;font-size:14px;line-height:1.6;">${escapeHtml(message)}</p>
  `;

  const html = wrapHtml(header, htmlBody, footer, locale);
  const sanitizedMessage = sanitizePlainText(message);
  const text = `${greeting}\n\n${sanitizedMessage}\n\n---\n${footer}`;

  return { subject, html, text };
}

/**
 * Render a test email template.
 */
export function renderTestEmail(locale: string): RenderedEmail {
  const header = t(locale, "email.header");
  const footer = t(locale, "email.footer");
  const subject = t(locale, "email.testSubject");
  const body = t(locale, "email.testBody");
  const greeting = t(locale, "email.greeting");

  const htmlBody = `
    <p style="margin:0 0 16px;color:#27272a;font-size:14px;line-height:1.6;">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 16px;color:#27272a;font-size:14px;line-height:1.6;">${escapeHtml(body)}</p>
  `;

  const html = wrapHtml(header, htmlBody, footer, locale);
  const sanitizedBody = sanitizePlainText(body);
  const text = `${greeting}\n\n${sanitizedBody}\n\n---\n${footer}`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Placeholder map — maps data field names to template placeholder names
//
// The i18n templates use placeholders like {name}, {automationCount}, etc.
// The structured data uses field names like moduleId, affectedAutomationCount.
// This map translates data fields to placeholder names for single-pass replacement.
// ---------------------------------------------------------------------------

const PLACEHOLDER_MAP: Record<string, string> = {
  moduleId: "name",
  affectedAutomationCount: "automationCount",
  pausedAutomationCount: "automationCount",
  purgedCount: "count",
};

// ---------------------------------------------------------------------------
// Message Builder — reuses notification i18n keys with data interpolation
// ---------------------------------------------------------------------------

function buildNotificationMessage(
  type: NotificationType,
  data: Record<string, unknown>,
  locale: string,
): string {
  // Map NotificationType to the notification i18n key (same keys as notification-dispatcher.ts)
  const messageKeyMap: Record<NotificationType, string> = {
    module_deactivated: "notifications.moduleDeactivated",
    module_reactivated: "notifications.moduleReactivated",
    module_unreachable: "notifications.moduleUnreachable",
    cb_escalation: "notifications.cbEscalation",
    consecutive_failures: "notifications.consecutiveFailures",
    auth_failure: "notifications.authFailure",
    vacancy_promoted: "notifications.vacancyPromoted",
    vacancy_batch_staged: "notifications.batchStaged",
    bulk_action_completed: "notifications.bulkActionCompleted",
    retention_completed: "notifications.retentionCompleted",
    job_status_changed: "notifications.jobStatusChanged",
  };

  const key = messageKeyMap[type];
  let message = t(locale, key);

  // Replace placeholders: for each data entry, replace both the direct field name
  // (e.g., {moduleId}) and the aliased template name (e.g., {name}) if mapped.
  for (const [k, v] of Object.entries(data)) {
    const value = String(v ?? "");
    message = message.replace(`{${k}}`, value);
    const alias = PLACEHOLDER_MAP[k];
    if (alias) {
      message = message.replace(`{${alias}}`, value);
    }
  }

  return message;
}
