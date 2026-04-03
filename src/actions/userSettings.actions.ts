"use server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { getCurrentUser } from "@/utils/user.utils";
import {
  UserSettings,
  UserSettingsData,
  defaultUserSettings,
  AiSettings,
  AutomationSettings,
  DisplaySettings,
} from "@/models/userSettings.model";
import type { NotificationPreferences } from "@/models/notification.model";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/models/notification.model";

export const getUserSettings = async (): Promise<ActionResult<UserSettings>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (!userSettings) {
      return {
        success: true,
        data: {
          userId: user.id,
          settings: defaultUserSettings,
        },
      };
    }

    const settings: UserSettingsData = JSON.parse(userSettings.settings);

    return {
      success: true,
      data: {
        userId: user.id,
        settings: {
          ...defaultUserSettings,
          ...settings,
        },
      },
    };
  } catch (error) {
    const msg = "Failed to fetch user settings.";
    return handleError(error, msg);
  }
};

export const updateUserSettings = async (
  settings: Partial<UserSettingsData>
): Promise<ActionResult<UserSettings>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const existingSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    let mergedSettings: UserSettingsData;

    if (existingSettings) {
      const currentSettings: UserSettingsData = JSON.parse(
        existingSettings.settings
      );
      mergedSettings = {
        ...defaultUserSettings,
        ...currentSettings,
        ...settings,
        ai: {
          ...defaultUserSettings.ai,
          ...currentSettings.ai,
          ...settings.ai,
        },
        display: {
          ...defaultUserSettings.display,
          ...currentSettings.display,
          ...settings.display,
        },
        automation: {
          ...defaultUserSettings.automation!,
          ...currentSettings.automation,
          ...settings.automation,
        },
        notifications: settings.notifications ?? currentSettings.notifications,
      };
    } else {
      mergedSettings = {
        ...defaultUserSettings,
        ...settings,
        ai: { ...defaultUserSettings.ai, ...settings.ai },
        display: { ...defaultUserSettings.display, ...settings.display },
        automation: { ...defaultUserSettings.automation!, ...settings.automation },
        notifications: settings.notifications,
      };
    }

    const userSettings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {
        settings: JSON.stringify(mergedSettings),
      },
      create: {
        userId: user.id,
        settings: JSON.stringify(mergedSettings),
      },
    });

    const parsedSettings: UserSettingsData = JSON.parse(userSettings.settings);

    return {
      success: true,
      data: {
        userId: user.id,
        settings: parsedSettings,
      },
    };
  } catch (error) {
    const msg = "Failed to update user settings.";
    return handleError(error, msg);
  }
};

export const updateAiSettings = async (
  aiSettings: AiSettings
): Promise<ActionResult<UserSettings>> => {
  return updateUserSettings({ ai: aiSettings });
};

export const updateDisplaySettings = async (
  displaySettings: DisplaySettings
): Promise<ActionResult<UserSettings>> => {
  // Sync locale to cookie for server-side access without DB query
  if (displaySettings.locale) {
    const cookieStore = await cookies();
    cookieStore.set("NEXT_LOCALE", displaySettings.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return updateUserSettings({ display: displaySettings });
};

export const updateAutomationSettings = async (
  automationSettings: AutomationSettings
): Promise<ActionResult<UserSettings>> => {
  return updateUserSettings({ automation: automationSettings });
};

/**
 * Fetch the resolved automation settings for a given userId.
 * Merges DB settings over defaults so callers always get a complete object.
 * Used internally by automation actions — NOT a server action export.
 */
export async function getAutomationSettingsForUser(
  userId: string
): Promise<AutomationSettings> {
  // Prevent IDOR: verify caller is authenticated and requesting own data (BS-6)
  const user = await getCurrentUser();
  if (!user || user.id !== userId) {
    return defaultUserSettings.automation!;
  }
  const defaults = defaultUserSettings.automation!;
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return defaults;
    const parsed: UserSettingsData = JSON.parse(row.settings);
    return { ...defaults, ...parsed.automation };
  } catch {
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

/**
 * Read the user's notification preferences.
 * Returns DEFAULT_NOTIFICATION_PREFERENCES when nothing is stored yet.
 */
export async function getNotificationPreferences(): Promise<
  ActionResult<NotificationPreferences>
> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const row = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (!row) {
      return { success: true, data: DEFAULT_NOTIFICATION_PREFERENCES };
    }

    const parsed: UserSettingsData = JSON.parse(row.settings);
    return {
      success: true,
      data: parsed.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES,
    };
  } catch (error) {
    return handleError(error, "errors.fetchNotificationPreferences");
  }
}

/**
 * Persist notification preferences for the current user.
 */
export async function updateNotificationPreferences(
  prefs: NotificationPreferences
): Promise<ActionResult<UserSettings>> {
  return updateUserSettings({ notifications: prefs });
}

/**
 * Fetch the resolved notification preferences for a given userId.
 * Used internally by the NotificationDispatcher consumer — NOT a server action.
 */
export async function getNotificationPreferencesForUser(
  userId: string
): Promise<NotificationPreferences> {
  // Prevent IDOR: verify caller is authenticated and requesting own data (BS-6)
  const user = await getCurrentUser();
  if (!user || user.id !== userId) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed: UserSettingsData = JSON.parse(row.settings);
    return parsed.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES;
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}
