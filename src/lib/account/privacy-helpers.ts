import "server-only";

/**
 * Privacy Settings Helper — reads PrivacySettings for a given userId.
 *
 * Server-only (no "use server") — used by internal helpers (account deletion,
 * cron rules, confirmation endpoint) that accept raw userId.
 * ADR-019: NOT a server action export.
 */

import prisma from "@/lib/db";
import {
  defaultPrivacySettings,
  type PrivacySettings,
  type UserSettingsData,
} from "@/models/userSettings.model";

/**
 * Read the privacy settings for a given userId.
 * Returns defaults when no settings row or no privacy key exists.
 */
export async function getPrivacySettingsForUser(
  userId: string,
): Promise<PrivacySettings> {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return defaultPrivacySettings;
    const parsed: UserSettingsData = JSON.parse(row.settings);
    return { ...defaultPrivacySettings, ...parsed.privacy };
  } catch {
    return defaultPrivacySettings;
  }
}
