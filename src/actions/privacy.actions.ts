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
  defaultPrivacySettings,
  defaultUserSettings,
  type PrivacySettings,
  type UserSettingsData,
} from "@/models/userSettings.model";

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
 * - coolingOffDays checked against allowed union values
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

    // Read existing settings and merge privacy
    const existingRow = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    let mergedSettings: UserSettingsData;

    if (existingRow) {
      const current: UserSettingsData = JSON.parse(existingRow.settings);
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
