"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    const result = await markAsRead(notificationId);
    if (result.success) {
      setNotifications((prev) => {
        const updated = prev.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n,
        );
        const unread = updated.filter((n) => !n.read).length;
        onCountChange?.(unread);
        return updated;
      });
    }
  };

  const handleDismiss = async (notificationId: string) => {
    const result = await dismissNotification(notificationId);
    if (result.success) {
      setNotifications((prev) => {
        const updated = prev.filter((n) => n.id !== notificationId);
        const unread = updated.filter((n) => !n.read).length;
        onCountChange?.(unread);
        return updated;
      });
    }
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{t("notifications.title")}</h3>
        {hasUnread && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={handleMarkAllAsRead}
          >
            <CheckCheck className="mr-1 h-3 w-3" />
            {t("notifications.markAllRead")}
          </Button>
        )}
      </div>
      <ScrollArea className="max-h-80">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            {t("notifications.noNotifications")}
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
