"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { useTranslations } from "@/i18n";

// Delay before moving focus to the "Open job" CTA on mount. Matches the
// 280ms slide-in animation plus a small buffer so the focus jump happens
// after the card has settled (the visual flash of focus ring mid-slide is
// jarring). `prefers-reduced-motion` bypasses the delay entirely.
// See CRIT-Y3 remediation — WCAG 2.4.3 (Focus Order) / 2.1.1 (Keyboard).
const FOCUS_ON_MOUNT_DELAY_MS = 320;

/**
 * Props for the presentational super-like celebration card.
 *
 * @see /home/pascal/projekte/jobsync/.team-feature/consult-task3-superlike-flyin.md
 */
export interface SuperLikeCelebrationProps {
  /** Unique celebration id (the host passes the underlying jobId). */
  id: string;
  /** Newly created Job id — navigation target for the "Open job" CTA. */
  jobId: string;
  /** Subtitle text — the source vacancy's title. */
  vacancyTitle: string;
  /** Number of celebrations queued behind this one (for the "+N more" badge). */
  queueRemaining: number;
  /** Called when the user (or the auto-dismiss timer) dismisses this celebration. */
  onDismiss: (id: string) => void;
  /** Called when the user clicks the primary CTA. The host handles navigation. */
  onOpenJob: (jobId: string) => void;
  /**
   * When `true`, the card plays the slide-down exit animation instead of the
   * slide-in entry. Driven by `SuperLikeCelebrationHost`'s grace period state
   * when one celebration is being replaced by the next. Defaults to `false`.
   *
   * While exiting, pointer/swipe interactions are ignored — the card is
   * committed to leaving and should not be re-dismissible mid-exit.
   */
  isExiting?: boolean;
}

// Auto-dismiss timing — see consultation §3.
const AUTO_DISMISS_MS = 6000;
// Swipe-down dismiss thresholds — see consultation §3.
const SWIPE_DISTANCE_Y = 48;
const SWIPE_VELOCITY_Y = 0.4; // px / ms

/**
 * Visual fly-in card celebrating a successful super-like.
 *
 * Behavior:
 * - Slide-up + fade entry (CSS, 280ms ease-out). Reduced motion → fade only.
 * - Auto-dismisses after 6s. Pauses on hover/focus, resumes with remaining time.
 * - Swipe-down dismiss via pointer events (48px or 0.4 px/ms threshold).
 * - X button + CTA both dismiss. A global Escape listener also dismisses the
 *   celebration from anywhere on the page (the CTA is NOT a modal, so the
 *   listener attaches to `document`, not the card).
 * - `role="status"` + `aria-live="polite"` (NOT assertive — never interrupts SR users).
 * - On mount, focus moves to the "Open job" CTA after the slide-in animation
 *   completes so keyboard users can act without Tab-hunting through the DOM.
 *   The initial programmatic focus does NOT pause the auto-dismiss timer;
 *   only subsequent user focus events do. `prefers-reduced-motion` bypasses
 *   the focus delay.
 * - The `role="status"` container intentionally has NO `aria-label`: an
 *   `aria-label` would override the visible text content and mask the
 *   vacancy title from screen readers (WCAG 1.3.1 / 4.1.2). Letting the
 *   accessible name fall back to the visible content ensures AT users hear
 *   both "Super-liked!" AND the vacancy title on the polite live announcement.
 *
 * The component does NOT trap focus. It is mounted inside a
 * `pointer-events-none` wrapper so the user can keep swiping the deck behind
 * it; only the inner card captures pointer events.
 */
export function SuperLikeCelebration({
  id,
  jobId,
  vacancyTitle,
  queueRemaining,
  onDismiss,
  onOpenJob,
  isExiting = false,
}: SuperLikeCelebrationProps) {
  const { t } = useTranslations();

  // Stable ids for aria-labelledby wiring. Using two ids (title + subtitle)
  // rather than a combined string means translators don't need a new
  // interpolated key, and the visible text content stays the single source
  // of truth for the announcement.
  const titleId = useId();
  const subtitleId = useId();

  // Auto-dismiss timer state. We track `remainingMs` in a ref so re-renders
  // do NOT reset the timer. `pausedAt` is the wall-clock time the timer was
  // paused (hover/focus); when resumed we subtract elapsed-while-running.
  const remainingMsRef = useRef<number>(AUTO_DISMISS_MS);
  const lastResumedAtRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef<boolean>(false);
  // Track whether this instance has already dismissed (prevents double-fire
  // during exit animations / unmount races).
  const hasDismissedRef = useRef<boolean>(false);

  // Ref to the primary CTA so we can programmatically move keyboard focus
  // on mount (CRIT-Y3 / WCAG 2.1.1 — Keyboard). See the mount effect below.
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  // The programmatic mount-focus synthesizes a `focusin` event which would
  // otherwise pause the auto-dismiss timer indefinitely. Flip this flag
  // BEFORE calling `.focus()` and have the focus-in handler consume it so
  // the first (programmatic) focus is ignored, but subsequent user focus
  // events still pause the timer (WCAG 2.2.1 — Timing Adjustable).
  const skipNextFocusPauseRef = useRef<boolean>(false);

  const handleDismiss = useCallback(() => {
    if (hasDismissedRef.current) return;
    hasDismissedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onDismiss(id);
  }, [id, onDismiss]);

  // Stable timer management — restart on mount, clear on unmount.
  useEffect(() => {
    lastResumedAtRef.current = Date.now();
    remainingMsRef.current = AUTO_DISMISS_MS;
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // Re-run when `id` changes so the host swapping celebrations resets the
    // timer cleanly.
  }, [id, handleDismiss]);

  const pauseTimer = useCallback(() => {
    if (isPausedRef.current) return;
    if (!timerRef.current) return;
    isPausedRef.current = true;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const elapsed = Date.now() - lastResumedAtRef.current;
    remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);
  }, []);

  const resumeTimer = useCallback(() => {
    if (!isPausedRef.current) return;
    isPausedRef.current = false;
    // Floor remaining time at 2000ms so users get a window to act after
    // moving the cursor away (consultation §3).
    const remaining = Math.max(2000, remainingMsRef.current);
    remainingMsRef.current = remaining;
    lastResumedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, remaining);
  }, [handleDismiss]);

  // Focus-pause wrapper: the programmatic mount-focus flips
  // `skipNextFocusPauseRef` so it is consumed here without pausing the
  // timer, leaving subsequent user focus events free to pause normally.
  // WCAG 2.2.1 (Timing Adjustable) — keyboard-only users with the
  // celebration focused must not have the 6s auto-dismiss race against
  // them while they read the title.
  const handleFocusIn = useCallback(() => {
    if (skipNextFocusPauseRef.current) {
      skipNextFocusPauseRef.current = false;
      return;
    }
    pauseTimer();
  }, [pauseTimer]);

  // Programmatic focus on mount: move focus to the "Open job" CTA so a
  // keyboard user can act on the celebration immediately, without tabbing
  // through the rest of the DOM (CRIT-Y3 / WCAG 2.1.1). The delay covers
  // the slide-in animation (280ms) with a small buffer; reduced-motion
  // users jump straight to the CTA. Skip focusing while `isExiting` — the
  // card is committed to leaving and stealing focus mid-exit would be
  // disorienting.
  useEffect(() => {
    if (isExiting) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const delay = prefersReducedMotion ? 0 : FOCUS_ON_MOUNT_DELAY_MS;

    const focusTimer = setTimeout(() => {
      const cta = ctaRef.current;
      if (!cta) return;
      // If focus has somehow already landed on the CTA (e.g. the user
      // clicked it during the slide-in), there is nothing to do.
      if (typeof document !== "undefined" && document.activeElement === cta) {
        return;
      }
      // Mark the forthcoming focus event as programmatic so `handleFocusIn`
      // does NOT pause the timer.
      skipNextFocusPauseRef.current = true;
      cta.focus();
    }, delay);

    return () => clearTimeout(focusTimer);
    // Re-run if `id` changes (shouldn't happen — host remounts via `key`)
    // or if `isExiting` toggles during the grace period.
  }, [id, isExiting]);

  // Global Escape listener: closes the celebration from anywhere on the
  // page, not just when focus is inside the card. Without this, a keyboard
  // user who never Tabs into the celebration cannot dismiss it except by
  // waiting out the 6s timer (CRIT-Y3 / WCAG 2.1.1). Guarded by
  // `isExiting` so we do not re-fire during the grace period.
  useEffect(() => {
    if (isExiting) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isExiting, handleDismiss]);

  // Pointer-driven swipe-down dismiss (matches the deck's pointer pattern).
  const dragStartRef = useRef<{ y: number; time: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartRef.current = { y: e.clientY, time: Date.now() };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pauseTimer();
  }, [pauseTimer]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current || !isDragging) return;
    const dy = e.clientY - dragStartRef.current.y;
    // Only track downward drag — upward motion is ignored.
    setDragY(Math.max(0, dy));
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    if (!dragStartRef.current || !isDragging) {
      setIsDragging(false);
      setDragY(0);
      return;
    }
    const elapsed = Date.now() - dragStartRef.current.time;
    const velocity = elapsed > 0 ? dragY / elapsed : 0;
    const shouldDismiss = dragY > SWIPE_DISTANCE_Y || velocity > SWIPE_VELOCITY_Y;

    dragStartRef.current = null;
    setIsDragging(false);
    setDragY(0);

    if (shouldDismiss) {
      handleDismiss();
    } else {
      // Spring back: resume the auto-dismiss timer with the remaining slice.
      resumeTimer();
    }
  }, [dragY, isDragging, handleDismiss, resumeTimer]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      // CRIT-Y3 remediation: use `aria-labelledby` pointing at the
      // title + subtitle paragraphs rather than a static `aria-label`.
      // A static `aria-label="Super-liked!"` overrode the accessible name
      // and hid the vacancy title from screen readers. Pointing at both
      // ids keeps the announcement ("Super-liked! Senior Full-Stack
      // Engineer") aligned with the visible content without dragging the
      // button labels ("Open job", "Close celebration") into the live
      // announcement (WCAG 1.3.1 / 4.1.2).
      aria-labelledby={`${titleId} ${subtitleId}`}
      data-testid="super-like-celebration"
      data-exiting={isExiting ? "true" : undefined}
      className="superlike-celebration pointer-events-auto relative w-[min(92vw,400px)] mx-4 rounded-2xl border border-blue-200 bg-card shadow-lg shadow-blue-500/10 dark:border-blue-900/60 dark:shadow-blue-400/5 motion-reduce:!transition-none motion-reduce:!transform-none"
      style={{
        // Slide-up + fade entry, or slide-down + fade exit when the host's
        // grace period is running. Reduced motion: skip the slide entirely
        // (the host also skips the grace period so this branch is rare).
        animation: isExiting
          ? "superlike-celebration-slide-out 300ms cubic-bezier(0.4, 0, 1, 1) forwards"
          : "superlike-celebration-slide-in 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        transform: isDragging ? `translateY(${dragY}px)` : undefined,
        opacity: isDragging ? Math.max(0.4, 1 - dragY / 200) : undefined,
        transition: isDragging ? "none" : "transform 200ms ease-out, opacity 200ms ease-out",
        touchAction: "pan-x", // allow horizontal browser gestures, capture vertical
        pointerEvents: isExiting ? "none" : undefined,
      }}
      onPointerDown={isExiting ? undefined : handlePointerDown}
      onPointerMove={isExiting ? undefined : handlePointerMove}
      onPointerUp={isExiting ? undefined : handlePointerUp}
      onPointerCancel={isExiting ? undefined : handlePointerUp}
      onMouseEnter={isExiting ? undefined : pauseTimer}
      onMouseLeave={isExiting ? undefined : resumeTimer}
      // Focus-pause wraps `pauseTimer` via `handleFocusIn` so the
      // programmatic mount-focus does NOT pause the timer indefinitely.
      // `onFocusCapture` / `onBlurCapture` fire for focus changes anywhere
      // inside the container (React normalizes focus bubbling).
      onFocusCapture={isExiting ? undefined : handleFocusIn}
      onBlurCapture={isExiting ? undefined : resumeTimer}
    >
      {/* Inline keyframes — keeps the component self-contained with no
          globals.css edit and respects prefers-reduced-motion. */}
      <style>{`
        @keyframes superlike-celebration-slide-in {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes superlike-celebration-slide-out {
          from { transform: translateY(0);    opacity: 1; }
          to   { transform: translateY(100%); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .superlike-celebration:not([data-exiting="true"]) {
            animation: superlike-celebration-fade-in 150ms linear !important;
          }
          .superlike-celebration[data-exiting="true"] {
            animation: superlike-celebration-fade-out 150ms linear forwards !important;
          }
        }
        @keyframes superlike-celebration-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes superlike-celebration-fade-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
      `}</style>

      {/* "+N more" queue badge */}
      {queueRemaining > 0 && (
        <span
          className="absolute -top-2 right-3 inline-flex items-center justify-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm dark:bg-blue-500"
          aria-hidden="true"
        >
          {t("deck.superLikeCelebration.moreQueued").replace("{count}", String(queueRemaining))}
        </span>
      )}

      <div className="flex items-center gap-3 p-4">
        {/* Sparkle chip — gradient blue (NOT a Star, see consultation §5). */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm dark:from-blue-400 dark:to-indigo-500">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>

        {/* Title + subtitle stack — referenced by `aria-labelledby` on the
            outer container so the screen reader announcement contains both
            "Super-liked!" AND the vacancy title. */}
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-sm font-semibold text-foreground leading-tight">
            {t("deck.superLikeCelebration.title")}
          </p>
          <p
            id={subtitleId}
            className="mt-0.5 truncate text-xs text-muted-foreground"
            title={vacancyTitle}
          >
            {vacancyTitle}
          </p>
        </div>

        {/* Primary CTA — "Open job". `ctaRef` is used by the mount-focus
            effect to move keyboard focus here immediately after the
            slide-in animation, so keyboard users can act on the
            celebration without Tab-hunting the rest of the DOM. */}
        <button
          ref={ctaRef}
          type="button"
          onClick={() => onOpenJob(jobId)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-400 dark:active:bg-blue-600"
        >
          <span>{t("deck.superLikeCelebration.openJob")}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("deck.superLikeCelebration.close")}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
