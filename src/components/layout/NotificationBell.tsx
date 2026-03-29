"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useTranslations } from "@/i18n";
import { getUnreadCount } from "@/actions/notification.actions";
import { NotificationDropdown } from "./NotificationDropdown";

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const { t } = useTranslations();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchCount = useCallback(async () => {
    const result = await getUnreadCount();
    if (result.success && result.data !== undefined) {
      setUnreadCount(result.data);
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCount]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    // Refresh count when dropdown closes (user may have marked items as read)
    if (!isOpen) {
      fetchCount();
    }
  };

  const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `${unreadCount} ${t("notifications.title")}`
              : t("notifications.title")
          }
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {displayCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <NotificationDropdown onCountChange={setUnreadCount} />
      </PopoverContent>
    </Popover>
  );
}
