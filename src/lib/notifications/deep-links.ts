/**
 * Notification deep-link mapping and title formatting helpers.
 *
 * Centralized 5W+H helpers for the notification UI:
 *  - `buildNotificationActions(type, data)` — deep-link mapping per notification type
 *  - `formatNotificationTitle(data, fallback, t)` — late-bound i18n resolution
 *  - `formatNotificationReason(data, t)` — optional context sentence
 *  - `formatNotificationActor(data, t)` — actor display name
 *
 * Why centralized: every notification must link somewhere. The mapping lives
 * here (single source of truth) and is consumed by `NotificationItem.tsx`.
 * Fallback rules kick in when contextual ids (automationId/jobId/moduleId) are
 * missing — we prefer a "safe" destination over no destination.
 *
 * Scope: this is a pragmatic implementation that reads from the existing
 * `data: Record<string, unknown>` JSON blob (no schema migration). See
 * `NotificationDataExtended` in `src/models/notification.model.ts`.
 *
 * Spec reference: .team-feature/consult-task4-notifications.md §3 (deep-link table)
 */

import type {
  NotificationDataExtended,
  NotificationType,
} from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Action Type + Builder
// ---------------------------------------------------------------------------

export interface NotificationAction {
  /** Internal deep-link target (must not be an external URL) */
  url: string;
  /** i18n key for the button label */
  labelKey: string;
  /** Visual variant — primary CTA vs. secondary link */
  variant?: "primary" | "secondary";
}

/**
 * Extract a string id from the notification data blob.
 * Returns undefined when the id is missing or not a string.
 *
 * Keeps the caller code tidy (no inline `typeof` checks) and guards
 * against accidental number/object ids.
 */
function getStringId(
  data: NotificationDataExtended | null,
  key: string,
): string | undefined {
  if (!data) return undefined;
  const value = data[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Build the list of deep-link actions for a notification.
 *
 * Rules:
 *  - Each type maps to 0-2 actions (primary + optional secondary).
 *  - Missing contextual ids degrade gracefully to a safe fallback (e.g. the
 *    staging queue root instead of a filtered view).
 *  - Unknown types return an empty array — the UI will skip the action row.
 *
 * All returned urls are internal routes; never include user-supplied URLs.
 */
export function buildNotificationActions(
  type: NotificationType,
  data: NotificationDataExtended | null,
): NotificationAction[] {
  switch (type) {
    case "vacancy_batch_staged": {
      const automationId = getStringId(data, "automationId");
      return automationId
        ? [
            {
              url: `/dashboard/staging?automationId=${encodeURIComponent(automationId)}`,
              labelKey: "notifications.action.viewStaged",
              variant: "primary",
            },
          ]
        : [
            {
              url: "/dashboard/staging",
              labelKey: "notifications.action.viewStaged",
              variant: "primary",
            },
          ];
    }

    case "vacancy_promoted": {
      const jobId = getStringId(data, "jobId");
      return jobId
        ? [
            {
              url: `/dashboard/myjobs/${encodeURIComponent(jobId)}`,
              labelKey: "notifications.action.openJob",
              variant: "primary",
            },
          ]
        : [];
    }

    case "bulk_action_completed":
      return [
        {
          url: "/dashboard/staging",
          labelKey: "notifications.action.viewStaging",
          variant: "primary",
        },
      ];

    case "module_deactivated":
    case "module_reactivated":
    case "module_unreachable":
      return [
        {
          url: `/dashboard/settings?section=modules`,
          labelKey: "notifications.action.openModules",
          variant: "primary",
        },
      ];

    case "cb_escalation":
    case "consecutive_failures": {
      const automationId = getStringId(data, "automationId");
      return automationId
        ? [
            {
              url: `/dashboard/automations/${encodeURIComponent(automationId)}`,
              labelKey: "notifications.action.openAutomation",
              variant: "primary",
            },
          ]
        : [];
    }

    case "auth_failure":
      return [
        {
          url: `/dashboard/settings?section=api-keys`,
          labelKey: "notifications.action.openApiKeys",
          variant: "primary",
        },
      ];

    case "retention_completed":
      return [
        {
          url: `/dashboard/settings?section=retention`,
          labelKey: "notifications.action.viewSettings",
          variant: "primary",
        },
      ];

    case "job_status_changed": {
      const jobId = getStringId(data, "jobId");
      return jobId
        ? [
            {
              url: `/dashboard/myjobs/${encodeURIComponent(jobId)}`,
              labelKey: "notifications.action.openJob",
              variant: "primary",
            },
          ]
        : [];
    }

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Format Helpers (late-bound i18n resolution)
// ---------------------------------------------------------------------------

/**
 * Substitute `{name}` placeholders in a template string.
 *
 * Missing params leave the placeholder intact (no crash, no silent drop —
 * makes missing translations obvious during development).
 */
function substituteParams(
  template: string,
  params: Record<string, string | number> | undefined,
): string {
  if (!params) return template;
  let out = template;
  for (const [k, v] of Object.entries(params)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/**
 * Resolve the notification title in the user's current locale.
 *
 * Flow:
 *  1. If `data.titleKey` is present, resolve via `t()` and substitute `titleParams`.
 *  2. Otherwise fall back to the legacy `message` field (backward compat for
 *     notifications created before this change).
 *
 * The `t` function is typed loosely (`(key: string) => string`) so this helper
 * can be called from tests without the full i18n runtime.
 */
export function formatNotificationTitle(
  data: NotificationDataExtended | null,
  fallbackMessage: string,
  t: (key: string) => string,
): string {
  if (!data?.titleKey) return fallbackMessage;
  const template = t(data.titleKey);
  return substituteParams(template, data.titleParams);
}

/**
 * Resolve the optional reason sentence (WHY) for a notification.
 * Returns `null` when no `reasonKey` is present — the UI should hide the row.
 */
export function formatNotificationReason(
  data: NotificationDataExtended | null,
  t: (key: string) => string,
): string | null {
  if (!data?.reasonKey) return null;
  const template = t(data.reasonKey);
  return substituteParams(template, data.reasonParams);
}

/**
 * Resolve the actor display name (WHO) for a notification.
 *
 * Precedence:
 *  1. `data.actorNameKey` → resolved via i18n (e.g. "notifications.actor.system")
 *  2. `data.actorId` → used verbatim (module id is a reasonable display fallback)
 *  3. Generic fallback key per `actorType`
 *  4. Empty string (the UI should hide the slot)
 */
export function formatNotificationActor(
  data: NotificationDataExtended | null,
  t: (key: string) => string,
): string {
  if (!data) return "";
  if (data.actorNameKey) {
    const resolved = t(data.actorNameKey);
    if (resolved && resolved !== data.actorNameKey) return resolved;
  }
  if (data.actorId) return data.actorId;
  switch (data.actorType) {
    case "system":
      return t("notifications.actor.system");
    case "automation":
      return t("notifications.actor.automation");
    case "user":
      return t("notifications.actor.user");
    default:
      return "";
  }
}

/**
 * Derive a severity for the notification (defaults when not set in data).
 *
 * This mirrors the icon selection in the UI so it stays consistent with
 * the color tokens applied to the icon/border.
 */
export function resolveNotificationSeverity(
  type: NotificationType,
  data: NotificationDataExtended | null,
): "info" | "success" | "warning" | "error" {
  if (data?.severity) return data.severity;
  switch (type) {
    case "auth_failure":
    case "module_unreachable":
      return "error";
    case "cb_escalation":
    case "consecutive_failures":
    case "module_deactivated":
      return "warning";
    case "module_reactivated":
    case "vacancy_promoted":
    case "bulk_action_completed":
    case "retention_completed":
      return "success";
    case "vacancy_batch_staged":
    case "job_status_changed":
    default:
      return "info";
  }
}
