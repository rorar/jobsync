"use server";

/**
 * Server Actions for Privacy & Security Settings (F-1, F-2, F-4).
 *
 * CRUD for PrivacySettings (embedded in UserSettings JSON).
 * All queries include userId (ADR-015 IDOR protection).
 * Runtime validation per ADR-019.
 */

import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import type { ActionResult } from "@/models/actionResult";
import {
  ALLOWED_CRM_RETENTION_DAYS,
  defaultPrivacySettings,
  defaultUserSettings,
  type PrivacySettings,
  type UserSettingsData,
} from "@/models/userSettings.model";
// ADR-019: server-only leaf, NOT re-exported from this "use server" file.
import { rebaseCrmRetention } from "@/lib/crm/retention-policy";

// ---------------------------------------------------------------------------
// Allowed cooling-off day values (ADR-019 runtime validation)
// ---------------------------------------------------------------------------

const ALLOWED_COOLING_OFF_DAYS = [0, 7, 14, 30] as const;

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Get the current user's privacy settings.
 * Returns defaults when no settings or no privacy key exists.
 */
export async function getPrivacySettings(): Promise<
  ActionResult<PrivacySettings>
> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "errors.notAuthenticated" };
    }

    const row = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (!row) {
      return { success: true, data: defaultPrivacySettings };
    }

    const parsed: UserSettingsData = JSON.parse(row.settings);
    return {
      success: true,
      data: { ...defaultPrivacySettings, ...parsed.privacy },
    };
  } catch (error) {
    return handleError(error, "errors.fetchPrivacySettings");
  }
}

/**
 * Update the current user's privacy settings.
 * Runtime validates all fields per ADR-019:
 * - booleans checked with typeof
 * - coolingOffDays / crmRetentionDays checked against allowed union values
 *
 * Side effect: changing the CRM retention period re-bases existing auto-created
 * contacts' deadlines so the new period takes effect immediately.
 */
export async function updatePrivacySettings(
  settings: PrivacySettings,
): Promise<ActionResult<PrivacySettings>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "errors.notAuthenticated" };
    }

    // --- ADR-019 Runtime Validation ---
    if (typeof settings.auditAccountDeletion !== "boolean") {
      return {
        success: false,
        message: "errors.invalidInput",
        errorCode: "VALIDATION_ERROR",
      };
    }
    if (typeof settings.emailConfirmationBeforeDeletion !== "boolean") {
      return {
        success: false,
        message: "errors.invalidInput",
        errorCode: "VALIDATION_ERROR",
      };
    }
    if (
      !(ALLOWED_COOLING_OFF_DAYS as readonly number[]).includes(
        settings.coolingOffDays,
      )
    ) {
      return {
        success: false,
        message: "errors.invalidInput",
        errorCode: "VALIDATION_ERROR",
      };
    }
    if (typeof settings.crmRetentionEnabled !== "boolean") {
      return {
        success: false,
        message: "errors.invalidInput",
        errorCode: "VALIDATION_ERROR",
      };
    }
    // ADR-019: the `180 | 365 | 730 | 1095` union is erased at runtime, so the
    // boundary check is the only thing standing between a crafted payload and a
    // retention period of, say, 3_650_000 days — i.e. option (d) "retain
    // forever" smuggled in as a configuration, which Art. 5(1)(e) does not
    // permit. Membership check, not a range check.
    if (
      !(ALLOWED_CRM_RETENTION_DAYS as readonly number[]).includes(
        settings.crmRetentionDays,
      )
    ) {
      return {
        success: false,
        message: "errors.invalidInput",
        errorCode: "VALIDATION_ERROR",
      };
    }

    // Read existing settings and merge privacy
    const existingRow = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    let mergedSettings: UserSettingsData;
    // Retention period BEFORE this save — needed to re-base existing deadlines.
    let previousRetentionDays = defaultPrivacySettings.crmRetentionDays;

    if (existingRow) {
      const current: UserSettingsData = JSON.parse(existingRow.settings);
      previousRetentionDays =
        current.privacy?.crmRetentionDays ?? defaultPrivacySettings.crmRetentionDays;
      mergedSettings = {
        ...current,
        privacy: settings,
      };
    } else {
      // No existing settings — create with defaults + privacy
      mergedSettings = {
        ...defaultUserSettings,
        privacy: settings,
      };
    }

    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: { settings: JSON.stringify(mergedSettings) },
      create: {
        userId: user.id,
        settings: JSON.stringify(mergedSettings),
      },
    });

    // Shortening the period must take effect NOW, not at each contact's next
    // edit. Without this the setting would be a lie — an operator tightening
    // 730 -> 180 to be more protective would see nothing happen for years,
    // which is the "system does not enforce its own declared retention policy"
    // defect (Art. 5(2)) this feature exists to fix, re-created as a config.
    // Exact + idempotent: the helper shifts stored deadlines by the delta.
    // Best-effort — the settings save itself has already succeeded.
    if (previousRetentionDays !== settings.crmRetentionDays) {
      await rebaseCrmRetention(
        user.id,
        previousRetentionDays,
        settings.crmRetentionDays,
      );
    }

    return { success: true, data: settings };
  } catch (error) {
    return handleError(error, "errors.updatePrivacySettings");
  }
}

/**
 * Check whether the current user has an active SMTP configuration.
 * Used by the UI to conditionally enable the email confirmation toggle.
 */
export async function getSmtpAvailable(): Promise<ActionResult<boolean>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "errors.notAuthenticated" };
    }

    const config = await prisma.smtpConfig.findUnique({
      where: { userId: user.id },
      select: { active: true },
    });

    return { success: true, data: !!config && config.active };
  } catch (error) {
    return handleError(error, "errors.checkSmtpAvailability");
  }
}
