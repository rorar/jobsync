/**
 * Notification deep-link mapping and title formatting helpers.
 *
 * Centralized 5W+H helpers for the notification UI:
 *  - `buildNotificationActions(type, data)` — deep-link mapping per notification type
 *  - `formatNotificationTitle(source, fallback, t)` — late-bound i18n resolution
 *  - `formatNotificationReason(source, t)` — optional context sentence
 *  - `formatNotificationActor(source, t)` — actor display name
 *
 * Why centralized: every notification must link somewhere. The mapping lives
 * here (single source of truth) and is consumed by `NotificationItem.tsx`.
 * Fallback rules kick in when contextual ids (automationId/jobId/moduleId) are
 * missing — we prefer a "safe" destination over no destination.
 *
 * After ADR-030 the 5W+H fields (titleKey, titleParams, actorType, actorId,
 * reasonKey, reasonParams, severity) live as first-class top-level columns on
 * the `Notification` Prisma model. The formatters accept either:
 *   1. A full `Notification` (or any object that exposes the new column-shaped
 *      fields) — the top-level fields take precedence, and the formatter falls
 *      back to the legacy `data.*` blob only when the column is null/missing.
 *   2. The legacy `NotificationDataExtended` blob — used by tests and older
 *      call sites; treated as the only source of structured fields.
 *
 * Spec reference: .team-feature/consult-task4-notifications.md §3 (deep-link table)
 */

import type {
  Notification,
  NotificationDataExtended,
  NotificationSeverity,
  NotificationType,
} from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Source adapter — prefer top-level columns, fall back to legacy `data.*`
// ---------------------------------------------------------------------------

/**
 * Minimal shape used by the formatters. Any object with these optional fields
 * can drive late-binding i18n resolution — a full `Notification`, a partial
 * select, or the legacy `data.*` blob via `fromLegacyData()`.
 */
export interface NotificationFormatSource {
  titleKey?: string | null;
  titleParams?: Record<string, string | number> | null | unknown;
  reasonKey?: string | null;
  reasonParams?: Record<string, string | number> | null | unknown;
  severity?: NotificationSeverity | null;
  actorType?:
    | "system"
    | "module"
    | "automation"
    | "user"
    | "enrichment"
    | null;
  actorId?: string | null;
  /** Legacy `data` blob fallback — only used when a top-level field is null. */
  data?: Record<string, unknown> | null;
}

/**
 * Wrap a legacy `NotificationDataExtended | null` in a `NotificationFormatSource`
 * so old call sites keep working. When invoked this way the formatter resolves
 * everything from the blob (top-level fields are left undefined).
 */
function fromLegacyData(
  data: NotificationDataExtended | null | undefined,
): NotificationFormatSource {
  return { data: (data ?? null) as Record<string, unknown> | null };
}

/**
 * Pull a legacy field out of `source.data` when the top-level column is null.
 * Centralizes the "prefer column, fall back to blob" rule in one place.
 */
function legacyField<T>(
  source: NotificationFormatSource,
  key: keyof NotificationDataExtended,
): T | undefined {
  const blob = source.data as NotificationDataExtended | null | undefined;
  if (!blob) return undefined;
  const value = blob[key];
  return value === undefined ? undefined : (value as T);
}

/**
 * Resolve a string field: top-level column wins, legacy `data.*` is fallback.
 */
function resolveStringField(
  source: NotificationFormatSource,
  top: string | null | undefined,
  legacyKey: keyof NotificationDataExtended,
): string | undefined {
  if (typeof top === "string" && top.length > 0) return top;
  const legacy = legacyField<unknown>(source, legacyKey);
  return typeof legacy === "string" && legacy.length > 0 ? legacy : undefined;
}

/**
 * Resolve a params object: top-level column wins, legacy `data.*` is fallback.
 */
function resolveParamsField(
  source: NotificationFormatSource,
  top: unknown,
  legacyKey: keyof NotificationDataExtended,
): Record<string, string | number> | undefined {
  const candidate =
    top && typeof top === "object" ? top : legacyField<unknown>(source, legacyKey);
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return candidate as Record<string, string | number>;
  }
  return undefined;
}

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
 * Normalize an input that can be either a new-shape source (Notification or
 * partial with top-level columns) or the legacy `NotificationDataExtended`
 * blob. Callers don't need to know which shape they hold.
 */
function toSource(
  input: NotificationFormatSource | NotificationDataExtended | null | undefined,
): NotificationFormatSource {
  if (!input) return fromLegacyData(null);
  // A NotificationFormatSource may carry its own nested `data` blob; a raw
  // legacy blob has `titleKey` as its own top-level property. We detect the
  // difference by checking for the column-shaped fields, which legacy blobs
  // do not carry at the top level of the wrapping object — only inside.
  const maybeSource = input as NotificationFormatSource;
  if (
    "data" in maybeSource &&
    (maybeSource.data === null ||
      (typeof maybeSource.data === "object" && !Array.isArray(maybeSource.data)))
  ) {
    return maybeSource;
  }
  // Treat it as a legacy data blob.
  return fromLegacyData(input as NotificationDataExtended | null);
}

/**
 * Resolve the notification title in the user's current locale.
 *
 * Precedence (ADR-030):
 *  1. Top-level `titleKey` column on the Notification row.
 *  2. Legacy `data.titleKey` blob (pre-migration rows and current rollout dual-write).
 *  3. The `fallbackMessage` argument (e.g. `notification.message`).
 *
 * Accepts either a `NotificationFormatSource` (full or partial Notification)
 * or a legacy `NotificationDataExtended` blob for backward compat. The `t`
 * function is typed loosely (`(key: string) => string`) so this helper can
 * be called from tests without the full i18n runtime.
 */
export function formatNotificationTitle(
  source: NotificationFormatSource | NotificationDataExtended | null | undefined,
  fallbackMessage: string,
  t: (key: string) => string,
): string {
  const normalized = toSource(source);
  const titleKey = resolveStringField(normalized, normalized.titleKey, "titleKey");
  if (!titleKey) return fallbackMessage;
  const template = t(titleKey);
  const titleParams = resolveParamsField(
    normalized,
    normalized.titleParams,
    "titleParams",
  );
  return substituteParams(template, titleParams);
}

/**
 * Resolve the optional reason sentence (WHY) for a notification.
 * Returns `null` when no `reasonKey` is present — the UI should hide the row.
 *
 * Precedence: top-level `reasonKey` column → legacy `data.reasonKey` → null.
 */
export function formatNotificationReason(
  source: NotificationFormatSource | NotificationDataExtended | null | undefined,
  t: (key: string) => string,
): string | null {
  const normalized = toSource(source);
  const reasonKey = resolveStringField(
    normalized,
    normalized.reasonKey,
    "reasonKey",
  );
  if (!reasonKey) return null;
  const template = t(reasonKey);
  const reasonParams = resolveParamsField(
    normalized,
    normalized.reasonParams,
    "reasonParams",
  );
  return substituteParams(template, reasonParams);
}

/**
 * Resolve the actor display name (WHO) for a notification.
 *
 * Precedence:
 *  1. `data.actorNameKey` → resolved via i18n (e.g. "notifications.actor.system")
 *     (actorNameKey has no top-level column yet — it lives in the blob only).
 *  2. Top-level `actorId` column → legacy `data.actorId` fallback.
 *  3. Generic fallback key per `actorType` (top-level column → legacy fallback).
 *  4. Empty string (the UI should hide the slot).
 *
 * EXHAUSTIVENESS (Sprint 3 M-A-01 + M-A-08): the switch below covers every
 * member of `NotificationActorType` — `system`, `module`, `automation`,
 * `user`, `enrichment`. The `default` branch uses a `never` assertion so
 * any future addition to the actor-type union will fail at compile time,
 * preventing silent fall-through (the original bug: `"module"` and
 * `"enrichment"` actors rendered as the raw `actorId` slug because the
 * switch had no matching case and fell into the empty-string default).
 */
export function formatNotificationActor(
  source: NotificationFormatSource | NotificationDataExtended | null | undefined,
  t: (key: string) => string,
): string {
  const normalized = toSource(source);
  const actorNameKey = legacyField<string>(normalized, "actorNameKey");
  if (actorNameKey) {
    const resolved = t(actorNameKey);
    if (resolved && resolved !== actorNameKey) return resolved;
  }
  const actorId = resolveStringField(normalized, normalized.actorId, "actorId");
  if (actorId) return actorId;
  const actorType = resolveStringField(
    normalized,
    normalized.actorType ?? null,
    "actorType",
  );
  if (!actorType) return "";
  // Narrow the loosely-typed string (resolveStringField returns `string | undefined`)
  // to the authoritative union so the `never` guard below actually fires on drift.
  const narrowed = actorType as NonNullable<NotificationFormatSource["actorType"]>;
  switch (narrowed) {
    case "system":
      return t("notifications.actor.system");
    case "module":
      return t("notifications.actor.module");
    case "automation":
      return t("notifications.actor.automation");
    case "user":
      return t("notifications.actor.user");
    case "enrichment":
      return t("notifications.actor.enrichment");
    default: {
      // Compile-time exhaustiveness guard — future additions to
      // `NotificationActorType` force a matching case here.
      const _exhaustive: never = narrowed;
      void _exhaustive;
      return "";
    }
  }
}

/**
 * Derive a severity for the notification (defaults when not set in data).
 *
 * Precedence: top-level `severity` column → legacy `data.severity` →
 * type-based default. This mirrors the icon selection in the UI so it stays
 * consistent with the color tokens applied to the icon/border.
 */
export function resolveNotificationSeverity(
  type: NotificationType,
  source: NotificationFormatSource | NotificationDataExtended | null | undefined,
): "info" | "success" | "warning" | "error" {
  const normalized = toSource(source);
  const severity =
    normalized.severity ?? legacyField<NotificationSeverity>(normalized, "severity");
  if (severity) return severity;
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

/**
 * Convenience helper — construct a `NotificationFormatSource` from a full
 * `Notification` row. Callers in UI code can pass `notification` through this
 * and get a clean interface the formatters accept. The `data` blob is
 * preserved for legacy fallback reads.
 */
export function notificationFormatSource(
  notification: Notification,
): NotificationFormatSource {
  return {
    titleKey: notification.titleKey,
    titleParams: notification.titleParams,
    reasonKey: notification.reasonKey,
    reasonParams: notification.reasonParams,
    severity: notification.severity,
    actorType: notification.actorType,
    actorId: notification.actorId,
    data: notification.data,
  };
}
