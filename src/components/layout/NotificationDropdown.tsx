"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { CheckCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/use-toast";
import { useTranslations } from "@/i18n";
import {
  getNotifications,
  markAllAsRead,
  markAsRead,
  dismissNotification,
} from "@/actions/notification.actions";
import type { Notification } from "@/models/notification.model";
import { NotificationItem } from "./NotificationItem";

interface NotificationDropdownProps {
  onCountChange?: (count: number) => void;
}

// ---------------------------------------------------------------------------
// Date grouping helpers
// ---------------------------------------------------------------------------

export type GroupKey = "today" | "yesterday" | "thisWeek" | "earlier";

export interface NotificationGroup {
  key: GroupKey;
  labelKey: string;
  notifications: Notification[];
  unreadCount: number;
}

/**
 * Return midnight of the given date in the local timezone.
 * Exported for unit testing (H-T-07).
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Bucket a notification by how old it is relative to `now`.
 * Groups: today, yesterday, thisWeek (last 7d excl. today/yesterday), earlier.
 *
 * DST-safe: instead of dividing by `86_400_000` (which silently mis-counts
 * on the 23h / 25h DST boundary days), we compare local-calendar `startOfDay`
 * anchors and decrement `created` one day at a time. Works correctly across
 * DST transitions because `setDate(d - 1)` rolls back calendar days rather
 * than raw milliseconds.
 *
 * Future dates (clock skew on the client or stale server-sent timestamps)
 * are bucketed as "today" intentionally — a notification the user just
 * received should never land in the past.
 *
 * Exported for unit testing (H-T-07).
 */
export function getGroupKey(createdAt: Date, now: Date): GroupKey {
  const today = startOfDay(now);
  const created = startOfDay(createdAt);

  // Future dates -> "today" bucket.
  if (created.getTime() >= today.getTime()) {
    return "today";
  }

  // Walk back one calendar day at a time (DST-safe). Yesterday = 1 step.
  const yesterday = startOfDay(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (created.getTime() >= yesterday.getTime()) {
    return "yesterday";
  }

  // This week = within the last 7 calendar days (excluding today / yesterday).
  const sixDaysAgo = startOfDay(now);
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
  if (created.getTime() >= sixDaysAgo.getTime()) {
    return "thisWeek";
  }

  return "earlier";
}

/**
 * Group notifications by time bucket, preserving ordering within each group.
 * Empty groups are omitted entirely. `now` is injected (not computed inline)
 * so unit tests can pin a deterministic clock.
 *
 * Exported for unit testing (H-T-07).
 */
export function groupNotifications(
  notifications: Notification[],
  now: Date = new Date(),
): NotificationGroup[] {
  const buckets: Record<GroupKey, Notification[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };

  for (const n of notifications) {
    const createdAt =
      n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt);
    const key = getGroupKey(createdAt, now);
    buckets[key].push(n);
  }

  const order: Array<{ key: GroupKey; labelKey: string }> = [
    { key: "today", labelKey: "notifications.group.today" },
    { key: "yesterday", labelKey: "notifications.group.yesterday" },
    { key: "thisWeek", labelKey: "notifications.group.thisWeek" },
    { key: "earlier", labelKey: "notifications.group.earlier" },
  ];

  return order
    .filter((g) => buckets[g.key].length > 0)
    .map((g) => ({
      key: g.key,
      labelKey: g.labelKey,
      notifications: buckets[g.key],
      unreadCount: buckets[g.key].filter((n) => !n.read).length,
    }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Shape returned by the `getNotifications` server action — extracted here
// to type the in-flight promise ref without widening it to `any`.
type GetNotificationsResult = Awaited<ReturnType<typeof getNotifications>>;

export function NotificationDropdown({ onCountChange }: NotificationDropdownProps) {
  const { t } = useTranslations();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // M-P-SPEC-03 — request dedup + stale-result discard.
  //
  // Without dedup, opening the dropdown while a previous fetch is still in
  // flight (e.g. rapid open/close, parent re-render, poll-triggered refresh)
  // queues a second round-trip to the server. We coalesce concurrent calls
  // by sharing the in-flight promise via `pendingFetchRef`.
  //
  // Server actions cannot be aborted via `AbortController` (Next.js does
  // not propagate AbortSignal through the server-action RPC channel), so
  // instead of cancelling the network request we cancel the RESULT: every
  // fetch captures the current `fetchEpochRef` value, and on resolution we
  // drop the payload if the epoch has advanced (dropdown closed / unmounted
  // / superseded). This keeps state from being mutated after unmount and
  // from being overwritten by an older response arriving late.
  const pendingFetchRef = useRef<Promise<GetNotificationsResult> | null>(null);
  const fetchEpochRef = useRef(0);
  const isMountedRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    // If a fetch is already in flight, reuse its promise. The awaiting
    // caller still runs the post-processing block below, but only the
    // first caller triggers a network round-trip.
    if (pendingFetchRef.current) {
      return pendingFetchRef.current;
    }
    const myEpoch = fetchEpochRef.current;
    setLoading(true);
    const pending = getNotifications(false, 50);
    pendingFetchRef.current = pending;
    try {
      const result = await pending;
      // If the epoch advanced while we were waiting, the caller no longer
      // cares about this result — swallow it without touching state.
      if (!isMountedRef.current || fetchEpochRef.current !== myEpoch) {
        return result;
      }
      if (result.success && result.data) {
        setNotifications(result.data);
        const unread = result.data.filter((n) => !n.read).length;
        onCountChange?.(unread);
      }
      return result;
    } finally {
      // Clear the in-flight ref ONLY if this is still the current one.
      // A newer fetch may have started between the await and the finally,
      // in which case we leave the newer one untouched.
      if (pendingFetchRef.current === pending) {
        pendingFetchRef.current = null;
      }
      if (isMountedRef.current && fetchEpochRef.current === myEpoch) {
        setLoading(false);
      }
    }
  }, [onCountChange]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchNotifications();
    return () => {
      // Bump the epoch so any in-flight fetch's result is discarded.
      // Drop the shared promise reference so a remount starts a fresh
      // request instead of resurrecting the old one.
      fetchEpochRef.current += 1;
      pendingFetchRef.current = null;
      isMountedRef.current = false;
    };
  }, [fetchNotifications]);

  const handleMarkAllAsRead = async () => {
    const result = await markAllAsRead();
    if (result.success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onCountChange?.(0);
    } else {
      toast({
        variant: "destructive",
        description: result.message || t("common.error"),
      });
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    const result = await markAsRead(notificationId);
    if (result.success) {
      let unread = 0;
      setNotifications((prev) => {
        const updated = prev.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n,
        );
        unread = updated.filter((n) => !n.read).length;
        return updated;
      });
      onCountChange?.(unread);
    } else {
      toast({
        variant: "destructive",
        description: result.message || t("common.error"),
      });
    }
  };

  const handleDismiss = async (notificationId: string) => {
    const result = await dismissNotification(notificationId);
    if (result.success) {
      let unread = 0;
      setNotifications((prev) => {
        const updated = prev.filter((n) => n.id !== notificationId);
        unread = updated.filter((n) => !n.read).length;
        return updated;
      });
      onCountChange?.(unread);
    } else {
      toast({
        variant: "destructive",
        description: result.message || t("common.error"),
      });
    }
  };

  const hasUnread = notifications.some((n) => !n.read);
  const groups = useMemo(
    () => groupNotifications(notifications),
    [notifications],
  );
  const totalItems = notifications.length;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3 min-w-0">
        <h3 className="text-sm font-semibold">{t("notifications.title")}</h3>
        {hasUnread && (
          /*
            M-Y-03 (CRIT-Y1 flashlight) — WCAG 2.5.5 AAA / 2.5.8 AA: the
            pointer target is 44×44 via the outer `h-11 w-11` button. The
            visible pill inside stays at 32×32 (h-8 w-8) so the dropdown
            header keeps its current visual rhythm. Hover/active feedback
            is forwarded to the visible pill via Tailwind's `group` utility
            so the full 44×44 area reacts. Same pattern as Sprint 1
            DeckCard Info button (commit `be610fb`) + the sibling
            NotificationItem dismiss button (M-Y-02).
          */
          <button
            type="button"
            className="group/markall h-11 w-11 shrink-0 rounded-md flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={handleMarkAllAsRead}
            aria-label={t("notifications.markAllRead")}
            title={t("notifications.markAllRead")}
          >
            <span
              aria-hidden="true"
              className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground transition-colors group-hover/markall:bg-accent group-hover/markall:text-accent-foreground group-active/markall:scale-95"
            >
              <CheckCheck className="h-4 w-4" />
            </span>
          </button>
        )}
      </div>
      <ScrollArea className="max-h-96">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {t("notifications.noNotifications")}
          </div>
        ) : (
          /*
            H-NEW-05 — WAI-ARIA 1.2: the `feed` role's "Required Owned
            Elements" rule allows ONLY `role="article"` children. Our
            previous markup nested `<section>` group wrappers directly
            inside the feed, which is an authoring violation and breaks
            `aria-posinset`/`aria-setsize` navigation in NVDA.

            The feed pattern is also overkill for a notification dropdown
            (feeds are intended for infinite streams where AT users walk
            article-by-article with keyboard-driven pagination). We drop
            `role="feed"` entirely and use a labelled `region` landmark
            instead. Each `<NotificationItem>` remains an `<article>` and
            still carries `aria-posinset` / `aria-setsize` for
            per-article AT navigation.
          */
          <div
            role="region"
            aria-busy={loading}
            aria-label={t("notifications.title")}
            className="divide-y"
          >
            {(() => {
              // Render groups with running position offsets so each item
              // gets a stable aria-posinset across the whole list.
              let runningIndex = 0;
              return groups.map((group) => {
                const groupItems = group.notifications.map((n) => {
                  runningIndex += 1;
                  return { notification: n, position: runningIndex };
                });
                return (
                  <section
                    key={group.key}
                    aria-label={t(group.labelKey)}
                    className="divide-y"
                  >
                    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-muted/60 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">
                      <span>{t(group.labelKey)}</span>
                      {group.unreadCount > 0 && (
                        <span className="text-[10px] font-normal text-muted-foreground/80">
                          {t("notifications.group.unreadCount").replace(
                            "{count}",
                            String(group.unreadCount),
                          )}
                        </span>
                      )}
                    </header>
                    {groupItems.map(({ notification, position }) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onMarkAsRead={handleMarkAsRead}
                        onDismiss={handleDismiss}
                        positionInSet={position}
                        setSize={totalItems}
                      />
                    ))}
                  </section>
                );
              });
            })()}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
