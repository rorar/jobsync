"use server";

/**
 * Account Management Server Actions (GDPR Privacy & Security).
 *
 * Handles the full account deletion lifecycle:
 * - requestAccountDeletion() — main entry (F-1 audit, F-2 email confirm, F-4 cooling-off)
 * - deleteAccount() — backward-compatible wrapper
 * - cancelAccountDeletion() — cancel a scheduled deletion
 * - getDeletionStatus() — check if a deletion is scheduled
 *
 * All queries include userId (ADR-015 IDOR protection).
 */

import { getCurrentUser } from "@/utils/user.utils";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import type { ActionResult } from "@/models/actionResult";
import { getPrivacySettingsForUser } from "@/lib/account/privacy-helpers";
import { generateDeletionToken } from "@/lib/account/deletion-token";
import { executeAccountDeletion } from "@/lib/account/execute-deletion";
import { writeAdminAuditLog } from "@/lib/auth/admin";
import { decrypt } from "@/lib/encryption";
import { validateSmtpHost } from "@/lib/smtp-validation";
import { createSmtpTransporter } from "@/lib/email/transport";
import { renderDeletionConfirmationEmail } from "@/lib/email/templates";
import { resolveUserLocale } from "@/lib/locale-resolver";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeletionRequestResult {
  pendingConfirmation?: boolean;
  scheduledAt?: string; // ISO date string
  deleted?: boolean;
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Backward-compatible wrapper — delegates to requestAccountDeletion().
 */
export async function deleteAccount(): Promise<ActionResult<DeletionRequestResult>> {
  return requestAccountDeletion();
}

/**
 * Request account deletion with GDPR privacy flow.
 *
 * Flow:
 * 1. F-1: If auditAccountDeletion -> write audit log
 * 2. F-2: If emailConfirmationBeforeDeletion AND SMTP configured ->
 *          generate token, send email, return pendingConfirmation
 * 3. F-4: If coolingOffDays > 0 -> set deletionScheduledAt, return scheduled
 * 4. Else: executeAccountDeletion(), return deleted
 */
export async function requestAccountDeletion(): Promise<
  ActionResult<DeletionRequestResult>
> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "errors.notAuthenticated" };
    }

    const privacy = await getPrivacySettingsForUser(user.id);

    // F-1: Audit trail
    if (privacy.auditAccountDeletion) {
      writeAdminAuditLog(
        user,
        {
          action: "account_deletion_requested",
          targetId: user.id,
          extra: {
            emailConfirmation: privacy.emailConfirmationBeforeDeletion,
            coolingOffDays: privacy.coolingOffDays,
          },
        },
        { allowed: true, tier: "explicit_list" },
      );
    }

    // F-2: Email confirmation
    if (privacy.emailConfirmationBeforeDeletion) {
      const smtpConfig = await prisma.smtpConfig.findUnique({
        where: { userId: user.id },
      });

      if (smtpConfig && smtpConfig.active) {
        // Generate token
        const { raw, hash, expiresAt } = generateDeletionToken();

        // Upsert token (one per user)
        await prisma.deletionConfirmationToken.upsert({
          where: { userId: user.id },
          update: { tokenHash: hash, expiresAt },
          create: { userId: user.id, tokenHash: hash, expiresAt },
        });

        // Send confirmation email
        const confirmationUrl = `${process.env.NEXTAUTH_URL}/api/account/confirm-deletion?token=${raw}`;

        let decryptedPassword: string;
        try {
          decryptedPassword = await decrypt(smtpConfig.password, smtpConfig.iv);
        } catch {
          return {
            success: false,
            message: "errors.smtpDecryptionFailed",
          };
        }

        // Validate SMTP host (SSRF re-validation)
        const hostCheck = validateSmtpHost(smtpConfig.host);
        if (!hostCheck.valid) {
          return {
            success: false,
            message: hostCheck.error ?? "smtp.ssrfBlocked",
          };
        }

        const locale = await resolveUserLocale(user.id);
        const { subject, html, text } =
          renderDeletionConfirmationEmail(locale, confirmationUrl);

        const transporter = createSmtpTransporter({
          host: smtpConfig.host,
          port: smtpConfig.port,
          username: smtpConfig.username,
          decryptedPassword,
          tlsRequired: smtpConfig.tlsRequired,
        });

        try {
          await transporter.sendMail({
            from: smtpConfig.fromAddress,
            to: user.email,
            subject: `[JobSync] ${subject}`,
            html,
            text,
          });
        } finally {
          transporter.close();
        }

        return { success: true, data: { pendingConfirmation: true } };
      }
    }

    // F-4: Cooling-off period
    if (privacy.coolingOffDays > 0) {
      const scheduledAt = new Date(
        Date.now() + privacy.coolingOffDays * 24 * 60 * 60 * 1000,
      );

      await prisma.user.update({
        where: { id: user.id },
        data: { deletionScheduledAt: scheduledAt },
      });

      return {
        success: true,
        data: { scheduledAt: scheduledAt.toISOString() },
      };
    }

    // Immediate deletion
    await executeAccountDeletion(user.id);
    return { success: true, data: { deleted: true } };
  } catch (error) {
    return handleError(error, "errors.accountDeletion");
  }
}

/**
 * Cancel a scheduled account deletion (during cooling-off period).
 */
export async function cancelAccountDeletion(): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "errors.notAuthenticated" };
    }

    // Verify a deletion is actually scheduled
    const dbUser = await prisma.user.findFirst({
      where: { id: user.id },
      select: { deletionScheduledAt: true },
    });

    if (!dbUser?.deletionScheduledAt) {
      return { success: false, message: "errors.noDeletionScheduled" };
    }

    // Clear scheduled deletion and remove any pending tokens
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { deletionScheduledAt: null },
      }),
      prisma.deletionConfirmationToken.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.cancelDeletion");
  }
}

/**
 * Get the current deletion status for the authenticated user.
 */
export async function getDeletionStatus(): Promise<
  ActionResult<{ scheduledAt: string | null }>
> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "errors.notAuthenticated" };
    }

    const dbUser = await prisma.user.findFirst({
      where: { id: user.id },
      select: { deletionScheduledAt: true },
    });

    return {
      success: true,
      data: {
        scheduledAt: dbUser?.deletionScheduledAt?.toISOString() ?? null,
      },
    };
  } catch (error) {
    return handleError(error, "errors.fetchDeletionStatus");
  }
}
