"use client";

import { useMemo } from "react";
import {
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Briefcase,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useTranslations,
  formatRelativeTime,
  formatDateTime,
} from "@/i18n";
import type {
  Notification,
  NotificationType,
  NotificationDataExtended,
} from "@/models/notification.model";
import {
  buildNotificationActions,
  formatNotificationTitle,
  formatNotificationReason,
  formatNotificationActor,
  resolveNotificationSeverity,
  type NotificationFormatSource,
} from "@/lib/notifications/deep-links";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
  /** Index of this item in the visible feed (for aria-posinset) */
  positionInSet?: number;
  /** Total number of items in the visible feed (for aria-setsize) */
  setSize?: number;
}

/**
 * Safely parse the notification data field.
 * Prisma Json fields come back as objects, but guard against string serialization.
 */
function parseNotificationData(
  data: unknown,
): NotificationDataExtended | null {
  if (!data) return null;
  if (typeof data === "object" && !Array.isArray(data)) {
    return data as NotificationDataExtended;
  }
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as NotificationDataExtended;
      }
    } catch (e) {
      console.warn("[parseNotificationData] Failed to parse notification data:", data, e);
    }
  }
  return null;
}

/**
 * Icon for a given severity — visual shorthand so users can scan quickly.
 * Severity is either stored in `data.severity` or derived from the type.
 */
function SeverityIcon({
  severity,
  type,
}: {
  severity: "info" | "success" | "warning" | "error";
  type: NotificationType;
}) {
  // Vacancy pipeline events get a briefcase regardless of severity — it's
  // a stronger domain cue than a generic status glyph.
  if (type === "vacancy_promoted") {
    return <Briefcase className="h-4 w-4 text-primary" aria-hidden="true" />;
  }
  switch (severity) {
    case "error":
      return <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
    case "warning":
      return (
        <AlertTriangle
          className="h-4 w-4 text-yellow-500"
          aria-hidden="true"
        />
      );
    case "success":
      return (
        <CheckCircle2
          className="h-4 w-4 text-green-500"
          aria-hidden="true"
        />
      );
    case "info":
    default:
      return <Info className="h-4 w-4 text-blue-500" aria-hidden="true" />;
  }
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
  positionInSet,
  setSize,
}: NotificationItemProps) {
  const { t, locale } = useTranslations();
  // M-P-05 — `parseNotificationData` runs `JSON.parse` + shape validation,
  // measurable on dropdowns with 20+ items. Memoize keyed on the notification
  // identity + the raw data reference. Notifications are server state and
  // immutable per id, so a reference-equal `data` means the parsed object
  // is still valid. If the server sends a new snapshot (different reference)
  // the memo recomputes. No stale-closure risk because we never mutate the
  // Notification object in place.
  const data = useMemo(
    () => parseNotificationData(notification.data),
    [notification.id, notification.data],
  );
  const type = notification.type as NotificationType;

  // Prefer top-level columns on the Notification row (ADR-030) and fall back
  // to the legacy `data.*` blob for pre-migration notifications. The legacy
  // blob is still passed to `buildNotificationActions` because it carries
  // contextual ids (jobId, automationId, stagedVacancyId, ...) that are NOT
  // promoted to columns.
  const formatSource: NotificationFormatSource = {
    titleKey: notification.titleKey,
    titleParams: notification.titleParams,
    reasonKey: notification.reasonKey,
    reasonParams: notification.reasonParams,
    severity: notification.severity,
    actorType: notification.actorType,
    actorId: notification.actorId,
    data,
  };

  const severity = resolveNotificationSeverity(type, formatSource);
  const actions = buildNotificationActions(type, data);
  const title = formatNotificationTitle(formatSource, notification.message, t);
  const reason = formatNotificationReason(formatSource, t);
  const actor = formatNotificationActor(formatSource, t);

  const createdAt =
    notification.createdAt instanceof Date
      ? notification.createdAt
      : new Date(notification.createdAt);
  const relativeTime = formatRelativeTime(createdAt, locale);
  const absoluteTime = formatDateTime(createdAt, locale);
  const isoTime = createdAt.toISOString();

  const titleId = `notif-title-${notification.id}`;
  const reasonId = reason ? `notif-reason-${notification.id}` : undefined;

  const handleMarkRead = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
  };

  const handleActionClick = () => {
    // Clicking an action both navigates (via Link) and marks as read.
    // Navigation is handled by Next.js Link; we only update read state here.
    handleMarkRead();
  };

  return (
    <article
      className={cn(
        "group relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
        !notification.read && "bg-muted/30 border-l-2 border-l-primary",
      )}
      aria-labelledby={titleId}
      aria-describedby={reasonId}
      aria-posinset={positionInSet}
      aria-setsize={setSize}
    >
      {/* Severity icon — decorative + non-text visual cue */}
      <div className="mt-0.5 flex-shrink-0">
        <SeverityIcon severity={severity} type={type} />
      </div>

      <div className="flex-1 min-w-0">
        {/* Header row: actor name + relative time (+ unread dot) */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0 flex-1">
            {actor && (
              <span className="text-xs font-semibold text-muted-foreground truncate">
                {actor}
              </span>
            )}
            <span className="text-xs text-muted-foreground/70" aria-hidden="true">
              {actor ? "·" : ""}
            </span>
            <time
              dateTime={isoTime}
              title={absoluteTime}
              className="text-xs text-muted-foreground whitespace-nowrap"
            >
              {relativeTime}
            </time>
          </div>
          {!notification.read && (
            <>
              {/* Non-visual cue so screen readers announce unread state */}
              <span className="sr-only">•</span>
              <span
                className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1"
                aria-hidden="true"
              />
            </>
          )}
        </div>

        {/* Body: title (WHAT) + optional reason (WHY) */}
        <p
          id={titleId}
          className={cn(
            "mt-1 text-sm leading-snug",
            !notification.read ? "font-medium" : "text-muted-foreground",
          )}
        >
          {title}
        </p>
        {reason && (
          <p
            id={reasonId}
            className="mt-0.5 text-xs text-muted-foreground line-clamp-2"
          >
            {reason}
          </p>
        )}

        {/* Footer: action buttons (HOW → WHERE) */}
        {actions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actions.map((action, idx) => (
              <Button
                key={`${action.url}-${idx}`}
                asChild
                size="sm"
                variant={action.variant === "primary" ? "default" : "ghost"}
                onClick={handleActionClick}
              >
                <Link href={action.url}>{t(action.labelKey)}</Link>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/*
        Dismiss button — always visible on touch, hover-revealed on desktop.

        M-Y-02 (CRIT-Y1 flashlight) — WCAG 2.5.5 AAA / 2.5.8 AA: the pointer
        target is 44×44 via the outer `h-11 w-11` button. The visible pill
        inside stays at 32×32 (h-8 w-8) to preserve the existing visual
        weight — the extra padding becomes an invisible hit-area around the
        glyph. Hover/active feedback is forwarded to the visible pill via
        Tailwind's `group` utility so the full 44×44 area reacts. Same
        pattern as Sprint 1 DeckCard Info button (commit `be610fb`).

        The wrapping div keeps its `opacity-0 group-hover:opacity-100`
        reveal behaviour on desktop — we only grow the hit-area, we do not
        reveal the button earlier.
      */}
      <div className="flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          className="group/dismiss h-11 w-11 rounded-md flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notification.id);
          }}
          aria-label={t("notifications.action.dismiss")}
        >
          <span
            aria-hidden="true"
            className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground transition-colors group-hover/dismiss:bg-accent group-hover/dismiss:text-accent-foreground group-active/dismiss:scale-95"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>
      </div>
    </article>
  );
}
