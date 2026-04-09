"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SuperLikeCelebration } from "./SuperLikeCelebration";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { CelebrationItem } from "@/hooks/useSuperLikeCelebrations";

/**
 * Grace period (ms) between a visible celebration sliding down and the next
 * one sliding up. Derived from the consultation (§4) — a brief fade-out
 * before the next card slides up makes rapid super-likes feel continuous
 * rather than jarring. 1500ms covers the 300ms slide-out animation plus a
 * perceptual beat that lets the eye settle before the next entrance.
 *
 * When `prefers-reduced-motion` is set we skip the grace period entirely —
 * the slide animation is the only reason for the delay.
 */
const GRACE_PERIOD_MS = 1500;

/**
 * Host that mounts the active super-like celebration card.
 *
 * The host is intentionally a thin wrapper: it owns the navigation side
 * effect (`router.push`) and the fixed-position viewport wrapper, while the
 * `SuperLikeCelebration` component owns the visual / animation / dismiss
 * behavior.
 *
 * Stacking semantics (FIFO, max 5) live in `useSuperLikeCelebrations`. This
 * component renders only the head of the queue (`current`), with a grace
 * period inserted between consecutive celebrations so the outgoing card can
 * slide down before the incoming one slides up.
 */
export interface SuperLikeCelebrationHostProps {
  /** The celebration that should be visible right now (or `null` for nothing). */
  current: CelebrationItem | null;
  /** Number of celebrations queued behind `current` (drives the "+N more" badge). */
  queueRemaining: number;
  /** Dismiss callback wired from `useSuperLikeCelebrations`. */
  dismiss: (id: string) => void;
}

export function SuperLikeCelebrationHost({
  current,
  queueRemaining,
  dismiss,
}: SuperLikeCelebrationHostProps) {
  const router = useRouter();
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // The celebration currently mounted inside the host. May lag behind
  // `current` during a grace period while the outgoing card fades out.
  const [displayedItem, setDisplayedItem] = useState<CelebrationItem | null>(
    current,
  );
  // Whether the displayed celebration is in its exit animation (and thus
  // should not be swapped until the grace period elapses).
  const [isExiting, setIsExiting] = useState(false);
  // Active grace-period timer, if any. Cleared on unmount or when a new
  // transition supersedes it.
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Same item (or both null) — nothing to transition.
    if (current?.id === displayedItem?.id) {
      return;
    }

    // No visible item yet — show the next one immediately (no grace period
    // on first mount; there's nothing to fade out).
    if (displayedItem === null) {
      setDisplayedItem(current);
      setIsExiting(false);
      return;
    }

    // Reduced motion: skip the grace period entirely and replace instantly.
    // The animation is the only reason for the delay, so honor the user's
    // preference by eliminating the transition.
    if (prefersReducedMotion) {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      setDisplayedItem(current);
      setIsExiting(false);
      return;
    }

    // A different celebration is queued (or the visible one was dismissed).
    // Mark the currently displayed item as exiting and schedule the swap.
    // If a previous grace period is still running, restart it so the new
    // target wins — the outgoing card keeps fading out during the extension,
    // which is acceptable for this rare rapid-dismiss edge case.
    setIsExiting(true);
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = setTimeout(() => {
      setDisplayedItem(current);
      setIsExiting(false);
      transitionTimerRef.current = null;
    }, GRACE_PERIOD_MS);
  }, [current, displayedItem, prefersReducedMotion]);

  // Clear any pending timer on unmount to avoid leaking timeouts across
  // route transitions.
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);

  if (!displayedItem) return null;

  // While exiting, suppress the "+N more" badge so it does not appear to
  // belong to the next card before it mounts.
  const effectiveQueueRemaining = isExiting ? 0 : queueRemaining;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none"
      style={{
        // iOS safe-area aware bottom offset (consultation §1).
        paddingBottom: "max(env(safe-area-inset-bottom, 0px) + 16px, 24px)",
      }}
    >
      <SuperLikeCelebration
        // key ties the instance to the displayed celebration so React
        // mounts a fresh component (and a fresh slide-in animation) when
        // the grace period elapses and a new item takes over.
        key={displayedItem.id}
        id={displayedItem.id}
        jobId={displayedItem.jobId}
        vacancyTitle={displayedItem.vacancyTitle}
        queueRemaining={effectiveQueueRemaining}
        isExiting={isExiting}
        onDismiss={dismiss}
        onOpenJob={(jobId) => {
          // Dismiss before navigating so the card does not flash on the next
          // route while React tears down. Navigation happens via the App
          // Router for client-side prefetch / transitions.
          dismiss(displayedItem.id);
          router.push(`/dashboard/myjobs/${jobId}`);
        }}
      />
    </div>
  );
}
