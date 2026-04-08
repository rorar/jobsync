"use client";

import { useState, useEffect, useCallback } from "react";
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
