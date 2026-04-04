export type NotificationType =
  | "module_deactivated"
  | "module_reactivated"
  | "module_unreachable"
  | "cb_escalation"
  | "consecutive_failures"
  | "auth_failure"
  // Vacancy pipeline events (0.6)
  | "vacancy_promoted"
  | "vacancy_batch_staged"
  | "bulk_action_completed"
  | "retention_completed";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  moduleId: string | null;
  automationId: string | null;
  read: boolean;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Notification Preferences (stored in UserSettings.settings JSON)
// ---------------------------------------------------------------------------

export interface NotificationPreferences {
  enabled: boolean; // global kill switch
  channels: {
    inApp: boolean;
    webhook: boolean;
    // future: email: boolean; push: boolean;
  };
  perType: Partial<Record<NotificationType, { enabled: boolean }>>;
  quietHours?: {
    enabled: boolean;
    start: string; // "22:00"
    end: string; // "07:00"
    timezone: string; // "Europe/Berlin"
  };
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  channels: { inApp: true, webhook: false },
  perType: {},
};

/**
 * All notification types for which per-type preferences can be configured.
 */
export const CONFIGURABLE_NOTIFICATION_TYPES: NotificationType[] = [
  "auth_failure",
  "consecutive_failures",
  "cb_escalation",
  "module_deactivated",
  "vacancy_promoted",
  "bulk_action_completed",
  "retention_completed",
];

/** Channel identifiers for shouldNotify checks */
export type NotificationChannelId = keyof NotificationPreferences["channels"];

/**
 * Check whether a notification of the given type should be dispatched
 * for a specific channel, according to the supplied preferences.
 *
 * Returns `true` when the notification should proceed, `false` to suppress.
 *
 * When no channel is specified, returns true if ANY channel is enabled
 * (backward compatible — used by the dispatcher to decide whether to
 * build a NotificationDraft at all).
 */
export function shouldNotify(
  prefs: NotificationPreferences,
  type: NotificationType,
  channel?: NotificationChannelId,
  now: Date = new Date(),
): boolean {
  // Global kill switch
  if (!prefs.enabled) return false;

  // Channel gate
  if (channel) {
    // Check specific channel
    if (!prefs.channels[channel]) return false;
  } else {
    // No channel specified — check if ANY channel is enabled
    const anyChannelEnabled = Object.values(prefs.channels).some(Boolean);
    if (!anyChannelEnabled) return false;
  }

  // Per-type override
  const perTypeEntry = prefs.perType[type];
  if (perTypeEntry && !perTypeEntry.enabled) return false;

  // Quiet hours
  if (prefs.quietHours?.enabled) {
    if (isWithinQuietHours(prefs.quietHours, now)) return false;
  }

  return true;
}

/**
 * Check if `now` falls within the configured quiet hours window.
 * Handles overnight ranges (e.g., 22:00 - 07:00).
 */
function isWithinQuietHours(
  qh: NonNullable<NotificationPreferences["quietHours"]>,
  now: Date,
): boolean {
  try {
    // Get current time in the configured timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: qh.timezone,
    });
    const parts = formatter.formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour");
    const minutePart = parts.find((p) => p.type === "minute");
    if (!hourPart || !minutePart) return false;

    const currentMinutes = parseInt(hourPart.value) * 60 + parseInt(minutePart.value);

    const [startH, startM] = qh.start.split(":").map(Number);
    const [endH, endM] = qh.end.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Same-day range (e.g., 09:00 - 17:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range (e.g., 22:00 - 07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch {
    // If timezone is invalid, don't suppress
    return false;
  }
}
