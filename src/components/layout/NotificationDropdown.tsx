"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type GroupKey = "today" | "yesterday" | "thisWeek" | "earlier";

interface NotificationGroup {
  key: GroupKey;
  labelKey: string;
  notifications: Notification[];
  unreadCount: number;
}

/** Return midnight of the given date in the local timezone. */
function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Bucket a notification by how old it is relative to `now`.
 * Groups: today, yesterday, thisWeek (last 7d excl. today/yesterday), earlier.
 */
function getGroupKey(createdAt: Date, now: Date): GroupKey {
  const today = startOfDay(now);
  const created = startOfDay(createdAt);
  const diffMs = today.getTime() - created.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "thisWeek";
  return "earlier";
}

/**
 * Group notifications by time bucket, preserving ordering within each group.
 * Empty groups are omitted entirely.
 */
function groupNotifications(
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

export function NotificationDropdown({ onCountChange }: NotificationDropdownProps) {
  const { t } = useTranslations();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const result = await getNotifications(false, 50);
    if (result.success && result.data) {
      setNotifications(result.data);
      const unread = result.data.filter((n) => !n.read).length;
      onCountChange?.(unread);
    }
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => {
    fetchNotifications();
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleMarkAllAsRead}
            aria-label={t("notifications.markAllRead")}
            title={t("notifications.markAllRead")}
          >
            <CheckCheck className="h-4 w-4" />
          </Button>
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
          <div
            role="feed"
            aria-busy={loading}
            aria-label={t("notifications.title")}
            className="divide-y"
          >
            {(() => {
              // Render groups with running position offsets so each item
              // gets a stable aria-posinset across the whole feed.
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
