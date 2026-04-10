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

  // L-P-02 (Sprint 4 Stream B) — Page Visibility API polling pause.
  //
  // Before: every open tab polled `getUnreadCount` every 30s indefinitely,
  // regardless of whether the tab was visible. For a user with 5 tabs open
  // across a workday (8h), that's 5 * 960 = 4800 server calls per user per
  // day purely on background/hidden tabs where the count cannot possibly
  // be useful (the bell is not visible). Under aggregate load this starts
  // to approach the SSE-less design cost bucket that H-P-09 flagged.
  //
  // Fix: listen to `document.visibilitychange` and pause the interval
  // while `document.hidden === true`. On resume, fire an immediate
  // `fetchCount` so the user sees a fresh count the instant they come
  // back to the tab — the 30s cadence resumes after that. When the tab
  // is hidden, we tear down the interval entirely (not just skip inside
  // the callback) so the browser can sleep the timer queue.
  //
  // Why not BroadcastChannel to dedupe across tabs: adds state sync
  // complexity, needs a leader election to decide which tab polls, and
  // doesn't help the single-tab case. Page Visibility alone cuts the
  // wasted calls on the dominant "user has one active tab" path AND the
  // "user has N background tabs" path, with zero cross-tab coordination.
  //
  // Architecture-patterns skill — "Dependencies point inward": the hook
  // depends on the browser's visibility signal (an outward concern) but
  // the polling cadence itself is a module-level constant
  // (`POLL_INTERVAL_MS`), so switching to SSE later only changes the
  // transport without touching the cadence policy.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval !== null) return;
      interval = setInterval(fetchCount, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    // Initial fetch — always runs, regardless of initial visibility, so a
    // freshly-mounted bell shows a count even if the tab was backgrounded
    // at mount time (rare but possible on tab restore).
    fetchCount();

    // SSR guard: `document` is not available during Next.js server render.
    // If we're running in a non-browser environment, fall back to the
    // legacy always-on polling — the component is a "use client" component
    // so this branch only matters for Jest / non-jsdom test environments.
    if (typeof document === "undefined") {
      startPolling();
      return () => stopPolling();
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Resume: fetch immediately to catch up, then restart the cadence.
        fetchCount();
        startPolling();
      }
    };

    // Start polling if the tab is currently visible; otherwise wait for
    // the user to come back. Either way, `handleVisibilityChange` will
    // drive subsequent transitions.
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
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
    // L-P-02 bonus (Sprint 4 Stream B): migrated `size="icon"` (40x40) to
    // `size="icon-lg"` (44x44) per Sprint 3 Stream F's new variant. The
    // bell is the primary notification entry point — it needs to meet
    // WCAG 2.5.5 AAA Target Size (44x44). The Header container is
    // `h-14` (56px) on mobile and `sm:h-auto` on desktop, so the extra
    // 4px fits comfortably without visual regression; the sibling
    // UserAvatar is 36x36 (smaller than the old 40x40 bell anyway), so
    // no alignment concerns. The 20x20 Bell glyph stays identical —
    // only the focusable/pointer target grew.
    <Button
      variant="ghost"
      size="icon-lg"
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
