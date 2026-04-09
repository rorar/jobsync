"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { useTranslations } from "@/i18n";

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
 * - X button + CTA both dismiss.
 * - `role="status"` + `aria-live="polite"` (NOT assertive — never interrupts SR users).
 *
 * The component does NOT manage focus and does NOT trap focus. It is mounted
 * inside a `pointer-events-none` wrapper so the user can keep swiping the
 * deck behind it; only the inner card captures pointer events.
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
      aria-label={t("deck.superLikeCelebration.title")}
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
      onFocusCapture={isExiting ? undefined : pauseTimer}
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

        {/* Title + subtitle stack */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">
            {t("deck.superLikeCelebration.title")}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={vacancyTitle}>
            {vacancyTitle}
          </p>
        </div>

        {/* Primary CTA — "Open job" */}
        <button
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
