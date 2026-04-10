"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
// M-Y-07 — debounce window for the live-region announcement. We only
// announce when the count has INCREASED AND remained stable for this long,
// so rapid churn (poll races, batched server events) doesn't spam the
// screen reader. 500ms is the lower bound suggested by the APG live-region
// guidance — long enough to coalesce near-simultaneous updates, short
// enough that the announcement still feels timely to AT users.
const LIVE_REGION_DEBOUNCE_MS = 500;

export function NotificationBell() {
  const { t } = useTranslations();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  // M-Y-07 — separate state for the live-region message. This is what the
  // screen reader reads aloud; the visual badge keeps its own (eager) state
  // in `unreadCount`. Decoupling them means re-renders of the bell (parent
  // state, media query flips) do NOT re-announce the count.
  const [liveRegionMessage, setLiveRegionMessage] = useState("");
  // Use a popover on >=768px, sheet on smaller screens (better touch affordance,
  // avoids unreliable popover anchoring on narrow viewports).
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Tracks the count we last ANNOUNCED so the effect only fires on increases
  // that actually cross a previously-stable threshold.
  const lastAnnouncedCountRef = useRef(0);
  // Pending debounce timer, so rapid updates reset the countdown.
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // M-Y-07 — announce on increase, debounced.
  //
  // Flow:
  //   1. Count changes (could be an increase, decrease, or same value).
  //   2. If the new count is NOT strictly greater than the last announced
  //      value, we just update the reference (decreases don't announce —
  //      the user marked something as read, they already know).
  //   3. Otherwise we arm a 500ms timer. If another change lands before the
  //      timer fires, we restart it. Only once the count stays stable for
  //      the full debounce window do we push a message into the live region.
  //   4. We clear the message string to "" first, then set it in a microtask
  //      so that re-announcing the SAME count (e.g. 3 → 2 → 3) still fires a
  //      fresh announcement (live regions only re-read on actual text
  //      changes).
  useEffect(() => {
    // A decrease (or no change) never announces; just sync the baseline.
    if (unreadCount <= lastAnnouncedCountRef.current) {
      lastAnnouncedCountRef.current = unreadCount;
      return;
    }
    // Debounce — reset any pending timer so we only announce once the
    // count is stable.
    if (announceTimerRef.current !== null) {
      clearTimeout(announceTimerRef.current);
    }
    announceTimerRef.current = setTimeout(() => {
      lastAnnouncedCountRef.current = unreadCount;
      // Clear first so repeated identical messages still announce.
      setLiveRegionMessage("");
      // Use a second timer (microtask-equivalent) so the empty string is
      // committed to the DOM before the real message overwrites it.
      setTimeout(() => {
        setLiveRegionMessage(
          `${unreadCount} ${t("notifications.title")}`,
        );
      }, 20);
      announceTimerRef.current = null;
    }, LIVE_REGION_DEBOUNCE_MS);
    return () => {
      if (announceTimerRef.current !== null) {
        clearTimeout(announceTimerRef.current);
        announceTimerRef.current = null;
      }
    };
  }, [unreadCount, t]);

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
        // The visible badge is decorative from an AT perspective — the
        // button's `aria-label` already carries the count for focused
        // users, and the sibling live region (below) announces increases
        // for users who are NOT focused on the bell. `aria-hidden` here
        // prevents double-announcement when AT walks the DOM.
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
        >
          {displayCount}
        </span>
      )}
    </Button>
  );

  // M-Y-07 — polite live region for unread-count increases. The content is
  // debounced to avoid screen-reader spam on rapid changes, and only fires
  // on INCREASES (a decrease means the user acted, they already know).
  // `role="status"` + `aria-live="polite"` is the WAI-ARIA APG pattern for
  // background notifications. `aria-atomic="true"` ensures AT reads the
  // full sentence, not a diff. The region itself is visually hidden via
  // `sr-only` — it's purely for assistive tech.
  const liveRegion = (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {liveRegionMessage}
    </div>
  );

  if (isDesktop) {
    return (
      <>
        {liveRegion}
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            <NotificationDropdown onCountChange={setUnreadCount} />
          </PopoverContent>
        </Popover>
      </>
    );
  }

  return (
    <>
      {liveRegion}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent side="right" className="w-[90vw] max-w-md p-0 sm:max-w-md">
          <SheetTitle className="sr-only">{t("notifications.title")}</SheetTitle>
          <NotificationDropdown onCountChange={setUnreadCount} />
        </SheetContent>
      </Sheet>
    </>
  );
}
