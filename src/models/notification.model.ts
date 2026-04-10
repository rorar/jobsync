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
  | "retention_completed"
  | "job_status_changed";

/**
 * Severity of a notification — drives icon/color.
 */
export type NotificationSeverity = "info" | "success" | "warning" | "error";

/**
 * Who dispatched the notification (actor).
 *
 * Sprint 4 L-A dead-variant removal: `"enrichment"` used to be a member of
 * this union. A full audit (`src/`, `specs/`) turned up zero production
 * writers populating `actorType: "enrichment"` and zero specs documenting a
 * planned enrichment-failure notification writer. Dead code is worse than
 * "planned but unimplemented" — when enrichment failure notifications land,
 * the introducing sprint re-adds the variant AND its writer in the same
 * change, and the `formatNotificationActor` `never` guard in
 * `src/lib/notifications/deep-links.ts` will point at the exact site that
 * needs a new `case`.
 */
export type NotificationActorType =
  | "system"
  | "module"
  | "automation"
  | "user";

/**
 * Extended notification data — the legacy 5W+H late-binding enrichment carried
 * in the `data: Json` blob.
 *
 * HISTORICAL CONTEXT
 * ------------------
 * Originally the structured 5W+H fields (titleKey, titleParams, actorType,
 * actorId, reasonKey, reasonParams, severity) lived inside this JSON blob as
 * a pragmatic shortcut that avoided a Prisma migration. ADR-030 (Decision B)
 * flagged that shortcut as follow-up work, and the structured fields have
 * since been promoted to first-class nullable columns on the `Notification`
 * model (see `Notification.titleKey` etc. below).
 *
 * This interface is still used for:
 *  1. Describing the shape of the legacy `data` blob for backward compat —
 *     the UI formatters fall back to `data.*` when the top-level columns are
 *     null (notifications created before the migration).
 *  2. Writers dual-write the same values into BOTH `data` and the new
 *     columns during rollout, so this shape remains authoritative for the
 *     JSON payload.
 *  3. Carrying contextual ids that are NOT promoted to columns (jobId,
 *     stagedVacancyId, automationId, moduleId, endpointUrl, ...). Those
 *     stay in `data` and power `buildNotificationActions()`.
 *
 * New readers should prefer the top-level columns on `Notification` and
 * only fall back to this blob for backward compat.
 */
export interface NotificationDataExtended {
  [key: string]: unknown;

  /** i18n key for WHAT (late-bound at render time) */
  titleKey?: string;
  /** Parameters for titleKey — substituted as `{paramName}` */
  titleParams?: Record<string, string | number>;

  /** Actor type (WHO) */
  actorType?: NotificationActorType;
  /** Stable actor identifier (e.g. moduleId, automationId) */
  actorId?: string;
  /** i18n key for the actor display name (falls back to actorId, then generic) */
  actorNameKey?: string;

  /** i18n key for the WHY sentence (optional context) */
  reasonKey?: string;
  /** Parameters for reasonKey */
  reasonParams?: Record<string, string | number>;

  /** Visual severity (icon/color) */
  severity?: NotificationSeverity;

  /** Deep-link target (WHERE). Prefer `buildNotificationActions()` for type-driven routing. */
  actionUrl?: string;
  /** i18n key for the CTA label (HOW) */
  actionLabelKey?: string;
}

/**
 * Domain representation of a notification row.
 *
 * The 5W+H structured fields (titleKey, titleParams, actorType, actorId,
 * reasonKey, reasonParams, severity) are first-class top-level columns after
 * the `add_notification_structured_fields` Prisma migration (ADR-030).
 *
 * Legacy notifications created before the migration have `null` in the new
 * columns and carry the same metadata inside `data: NotificationDataExtended`.
 * UI formatters prefer the top-level columns and fall back to `data.*` for
 * backward compat.
 */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  message: string;
  moduleId: string | null;
  automationId: string | null;
  data: Record<string, unknown> | null;
  // 5W+H structured fields — promoted from `data` to top-level columns.
  // All nullable for backward compat with pre-migration rows.
  severity: NotificationSeverity | null;
  actorType: NotificationActorType | null;
  actorId: string | null;
  titleKey: string | null;
  titleParams: Record<string, string | number> | null;
  reasonKey: string | null;
  reasonParams: Record<string, string | number> | null;
  read: boolean;
  createdAt: Date;
}

/**
 * Type guard — returns true when the notification carries the new top-level
 * structured fields (i.e. was created after the migration). Useful for
 * discriminating between "prefer columns" and "fall back to data.*" paths.
 */
export function hasStructuredFields(
  notification: Pick<Notification, "titleKey" | "severity" | "actorType">,
): boolean {
  return (
    notification.titleKey !== null ||
    notification.severity !== null ||
    notification.actorType !== null
  );
}

// ---------------------------------------------------------------------------
// Notification Preferences (stored in UserSettings.settings JSON)
// ---------------------------------------------------------------------------

export interface NotificationPreferences {
  enabled: boolean; // global kill switch
  channels: {
    inApp: boolean;
    webhook: boolean;
    email: boolean;
    push: boolean;
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
  channels: { inApp: true, webhook: false, email: false, push: false },
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
  "module_reactivated",
  "module_unreachable",
  "vacancy_promoted",
  "vacancy_batch_staged",
  "bulk_action_completed",
  "retention_completed",
  "job_status_changed",
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
