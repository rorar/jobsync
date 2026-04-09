"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslations } from "@/i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { getUnreadCount } from "@/actions/notification.actions";
import { NotificationDropdown } from "./NotificationDropdown";

const POLL_INTERVAL_MS = 30_000;

export function NotificationBell() {
  const { t } = useTranslations();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  // Use a popover on >=768px, sheet on smaller screens (better touch affordance,
  // avoids unreliable popover anchoring on narrow viewports).
  const isDesktop = useMediaQuery("(min-width: 768px)");

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
  const ariaLabel =
    unreadCount > 0
      ? `${unreadCount} ${t("notifications.title")}`
      : t("notifications.title");

  const triggerButton = (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={ariaLabel}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {displayCount}
        </span>
      )}
    </Button>
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <NotificationDropdown onCountChange={setUnreadCount} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{triggerButton}</SheetTrigger>
      <SheetContent side="right" className="w-[90vw] max-w-md p-0 sm:max-w-md">
        <SheetTitle className="sr-only">{t("notifications.title")}</SheetTitle>
        <NotificationDropdown onCountChange={setUnreadCount} />
      </SheetContent>
    </Sheet>
  );
}
