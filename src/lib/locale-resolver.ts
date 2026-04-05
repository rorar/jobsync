import "server-only";

/**
 * Shared locale resolver — resolves a user's preferred locale from UserSettings.
 *
 * Used by: notification-dispatcher, email.channel, webhook.channel, smtp.actions.
 * Eliminates 4x duplicated resolveUserLocale/resolveLocale implementations.
 */

import prisma from "@/lib/db";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/locales";
import type { UserSettingsData } from "@/models/userSettings.model";

export async function resolveUserLocale(userId: string): Promise<string> {
  try {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) return DEFAULT_LOCALE;
    const parsed: UserSettingsData = JSON.parse(settings.settings);
    const locale = parsed?.display?.locale;
    return locale && isValidLocale(locale) ? locale : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
