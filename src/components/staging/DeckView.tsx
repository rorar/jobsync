"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  X,
  Check,
  Star,
  Undo2,
  Inbox,
  CheckCircle2,
  Ban,
  ChevronRight,
} from "lucide-react";
import { useTranslations } from "@/i18n";
import { useDeckStack } from "@/hooks/useDeckStack";
import type { DeckAction } from "@/hooks/useDeckStack";
import { DeckCard } from "./DeckCard";
import { SuperLikeCelebrationHost } from "./SuperLikeCelebrationHost";
import { useSuperLikeCelebrationsContext } from "@/context/SuperLikeCelebrationsContext";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

/**
 * Imperative handle exposed via `ref` on `<DeckView>`. Used by
 * `StagingContainer` so external entry points (currently: the details sheet
 * in deck mode) can drive the deck state machine WITHOUT bypassing
 * `useDeckStack.performAction`.
 *
 * This is the fix for CRIT-A-06 (Sprint 1.5). The previous hotfix (`2caab7e`,
 * honesty-gate remediation for bug #17) routed sheet actions through
 * `StagingContainer.handleDeckAction`, which is the SERVER-ACTION dispatcher
 * consumed by `useDeckStack.performAction` via its `onAction` prop — NOT the
 * state machine itself. As a result, sheet-triggered dismiss/promote/superlike/
 * block actions fired the server action but left `currentIndex`, `undoStack`,
 * `stats`, and the exit animation in a stale state. The card visually stayed
 * in front of the user after the sheet closed.
 *
 * With this handle, the sheet adapters in deck mode now call
 * `deckViewRef.current?.dismiss()` etc. — which invokes the SAME imperatives
 * the swipe/action-rail buttons use, guaranteeing that every deck entry point
 * flows through `performAction` per the ADR-030 Decision C invariant.
 *
 * @see docs/adr/030-deck-action-contract-and-notification-late-binding.md Decision C
 * @see specs/vacancy-pipeline.allium `DeckActionRoutingInvariant`
 */
export interface DeckViewHandle {
  /** Dismiss the current card (routes through `useDeckStack.performAction`). */
  dismiss: () => void;
  /** Promote the current card (routes through `useDeckStack.performAction`). */
  promote: () => void;
  /** Super-like the current card (routes through `useDeckStack.performAction`). */
  superLike: () => void;
  /** Block the current card's company (routes through `useDeckStack.performAction`). */
  block: () => void;
  /** Skip the current card (routes through `useDeckStack.performAction`). */
  skip: () => void;
}

interface DeckViewProps {
  vacancies: StagedVacancyWithAutomation[];
  /**
   * Server-action dispatcher. Must surface `createdJobId` for successful
   * super-likes so the celebration fly-in can offer "Open job".
   */
  onAction: (
    vacancy: StagedVacancyWithAutomation,
    action: DeckAction,
  ) => Promise<{ success: boolean; createdJobId?: string }>;
  onUndo?: (entry: { vacancy: StagedVacancyWithAutomation; action: DeckAction; index: number }) => Promise<void>;
  onBackToList: () => void;
  /**
   * Called when the user requests the full-detail sheet for the current card
   * (via the in-card Info button or the `i` keyboard shortcut). The parent is
   * responsible for rendering the sheet — `DeckView` only reports intent and
   * tracks open state internally so it can gate drag handlers and keyboard
   * shortcuts while the sheet is open.
   */
  onOpenDetails?: (vacancy: StagedVacancyWithAutomation) => void;
  /**
   * Whether the detail sheet is currently open. When `true`, pointer drag and
   * deck-wide keyboard shortcuts are disabled so the underlying card stays put.
   */
  isDetailsOpen?: boolean;
}

// Swipe thresholds
const SWIPE_DISTANCE_X = 100;
const SWIPE_DISTANCE_Y = 80;
const SWIPE_VELOCITY = 0.5;

// Threshold for button highlight during drag
const HIGHLIGHT_THRESHOLD = 30;

// localStorage key for auto-approve preference
export const AUTO_APPROVE_KEY = "jobsync_deck_auto_approve";

function getAutoApproveDefault(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AUTO_APPROVE_KEY) === "true";
  } catch {
    return false;
  }
}

export const DeckView = forwardRef<DeckViewHandle, DeckViewProps>(function DeckView(
  {
    vacancies,
    onAction,
    onUndo,
    onBackToList,
    onOpenDetails,
    isDetailsOpen = false,
  }: DeckViewProps,
  ref,
) {
  const { t } = useTranslations();
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const [autoApprove, setAutoApprove] = useState(getAutoApproveDefault);
  const [lastAction, setLastAction] = useState<string>("");
  // Super-like celebration queue (Stream D / task 3). Owns the FIFO state
  // for the fly-in card; rendered by SuperLikeCelebrationHost below.
  //
  // M-A-07 (Sprint 3 Stream B): consumed via
  // `useSuperLikeCelebrationsContext` so the queue's lifetime is bound to
  // the dashboard layout (via `SuperLikeCelebrationsProvider`) rather than
  // `DeckView`'s own mount. That means clicking "Open job" on a celebration
  // no longer destroys the queue when `router.push` navigates away — the
  // remaining queued celebrations survive navigation and re-render under
  // the next page that also consumes the context. In isolated component
  // tests that don't wrap in the provider, the hook falls back to a
  // component-local queue (same shape as the pre-fix behaviour).
  const celebrations = useSuperLikeCelebrationsContext();
  const {
    currentIndex,
    currentVacancy,
    nextVacancy,
    thirdVacancy,
    exitDirection,
    isAnimating,
    canUndo,
    stats,
    totalCount,
    isSessionComplete,
    dismiss,
    promote,
    superLike,
    block,
    skip,
    undo,
    containerRef,
  } = useDeckStack({
    vacancies,
    onAction,
    onUndo,
    isDetailsOpen,
    onSuperLikeSuccess: (jobId, vacancy) =>
      celebrations.add({ jobId, vacancyTitle: vacancy.title }),
    onSuperLikeUndone: (jobId) => celebrations.removeByJobId(jobId),
  });

  // Expose the deck state machine's imperatives to the parent via ref so the
  // details sheet (mounted as a sibling of DeckView in StagingContainer) can
  // drive the SAME `performAction` pipeline the swipe/action-rail buttons use.
  // See DeckViewHandle above for the ADR-030 Decision C invariant rationale.
  useImperativeHandle(
    ref,
    () => ({
      dismiss,
      promote,
      superLike,
      block,
      skip,
    }),
    [dismiss, promote, superLike, block, skip],
  );

  // Touch/pointer drag state
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; time: number } | null>(null);

  // Persist auto-approve to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_APPROVE_KEY, String(autoApprove));
    } catch (e) {
      console.warn("[DeckView] Failed to persist auto-approve preference:", e);
    }
  }, [autoApprove]);

  // Clear action announcement after 3 seconds
  useEffect(() => {
    if (!lastAction) return;
    const timer = setTimeout(() => setLastAction(""), 3000);
    return () => clearTimeout(timer);
  }, [lastAction]);

  // Keyboard shortcut: `i` opens the details sheet. This listener is separate
  // from `useDeckStack`'s shortcuts so it can fire even when the sheet is not
  // open yet, and so it never fires while the sheet is already open.
  //
  // M-P-06: the previous implementation re-subscribed the `keydown` listener
  // on every card advance because `currentVacancy` (which changes per card)
  // was a direct dep of this effect. Power users triaging 50+ vacancies in
  // one deck session triggered 50+ subscribe/unsubscribe cycles inside the
  // 300ms swipe animation window. Fix: park the per-render inputs in a
  // ref, subscribe the listener ONCE on mount, and read `ref.current` inside
  // the handler. The ref write itself is O(1) and never tears down the DOM
  // subscription. See .team-feature/stream-5b-performance.md M-P-06.
  const detailsKeyHandlerStateRef = useRef({
    onOpenDetails,
    isDetailsOpen,
    currentVacancy,
  });
  detailsKeyHandlerStateRef.current = {
    onOpenDetails,
    isDetailsOpen,
    currentVacancy,
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "i") return;

      const state = detailsKeyHandlerStateRef.current;
      if (!state.onOpenDetails) return;
      if (state.isDetailsOpen) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const container = containerRef.current;
      if (!container || !container.contains(target)) return;

      if (!state.currentVacancy) return;
      e.preventDefault();
      state.onOpenDetails(state.currentVacancy);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // Intentionally empty deps: the handler reads the latest inputs through
    // `detailsKeyHandlerStateRef` so we only subscribe once on mount.
    // `containerRef` is a stable ref from `useDeckStack` and does not need
    // to be in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isDetailsOpen) return;
    if (isAnimating || !currentVacancy) return;
    dragStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [isAnimating, currentVacancy, isDetailsOpen]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDetailsOpen) return;
    if (!dragStart.current || !isDragging) return;
    setDragDelta({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }, [isDragging, isDetailsOpen]);

  const handlePointerUp = useCallback(() => {
    if (isDetailsOpen) {
      // Reset any in-flight drag state defensively if the sheet opened mid-drag.
      dragStart.current = null;
      setIsDragging(false);
      setDragDelta({ x: 0, y: 0 });
      return;
    }
    if (!dragStart.current || !isDragging) return;
    const elapsed = Date.now() - dragStart.current.time;
    const velocityX = elapsed > 0 ? dragDelta.x / elapsed : 0;
    const velocityY = elapsed > 0 ? dragDelta.y / elapsed : 0;

    // Check thresholds
    if (dragDelta.x > SWIPE_DISTANCE_X || velocityX > SWIPE_VELOCITY) {
      setShowSwipeHint(false);
      promote();
    } else if (dragDelta.x < -SWIPE_DISTANCE_X || velocityX < -SWIPE_VELOCITY) {
      setShowSwipeHint(false);
      dismiss();
    } else if (dragDelta.y < -SWIPE_DISTANCE_Y || velocityY < -SWIPE_VELOCITY) {
      setShowSwipeHint(false);
      superLike();
    } else if (dragDelta.y > SWIPE_DISTANCE_Y || velocityY > SWIPE_VELOCITY) {
      setShowSwipeHint(false);
      block();
    }
    // else: spring back (reset delta)

    dragStart.current = null;
    setIsDragging(false);
    setDragDelta({ x: 0, y: 0 });
  }, [isDragging, dragDelta, promote, dismiss, superLike, block, isDetailsOpen]);

  // Calculate overlay opacities during drag
  const rightOverlay = Math.min(1, Math.max(0, dragDelta.x / SWIPE_DISTANCE_X));
  const leftOverlay = Math.min(1, Math.max(0, -dragDelta.x / SWIPE_DISTANCE_X));
  const upOverlay = Math.min(1, Math.max(0, -dragDelta.y / SWIPE_DISTANCE_Y));
  const downOverlay = Math.min(1, Math.max(0, dragDelta.y / SWIPE_DISTANCE_Y));

  // Button highlight states based on drag direction
  const highlightPromote = isDragging && dragDelta.x > HIGHLIGHT_THRESHOLD;
  const highlightDismiss = isDragging && dragDelta.x < -HIGHLIGHT_THRESHOLD;
  const highlightSuperLike = isDragging && dragDelta.y < -HIGHLIGHT_THRESHOLD;
  const highlightBlock = isDragging && dragDelta.y > HIGHLIGHT_THRESHOLD;

  // Empty state
  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8 max-w-sm mx-auto text-center">
        <Inbox className="h-16 w-16 text-muted-foreground/40" />
        <h3 className="text-lg font-medium mt-4">{t("deck.emptyTitle")}</h3>
        <p className="text-sm text-muted-foreground mt-2">{t("deck.emptyDescription")}</p>
        <Button variant="outline" className="mt-6" onClick={onBackToList}>
          {t("deck.backToList")}
        </Button>
      </div>
    );
  }

  // Session complete
  if (isSessionComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8 max-w-sm mx-auto text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-500/60" />
        <h3 className="text-lg font-medium mt-4">{t("deck.sessionCompleteTitle")}</h3>
        <p className="text-sm text-muted-foreground mt-2">
          {t("deck.sessionCompleteDescription")
            .replace("{count}", String(stats.promoted + stats.dismissed + stats.superLiked + stats.blocked + stats.skipped))
            .replace("{promoted}", String(stats.promoted + stats.superLiked))
            .replace("{dismissed}", String(stats.dismissed))
            .replace("{blocked}", String(stats.blocked))
            .replace("{skipped}", String(stats.skipped))}
        </p>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={onBackToList}>
            {t("deck.backToList")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      tabIndex={0}
      role="region"
      aria-label={t("deck.viewModeDeck")}
    >
      {/* Counter */}
      <div className="text-sm text-muted-foreground tabular-nums mb-3 self-end">
        {t("deck.counter")
          .replace("{current}", String(currentIndex + 1))
          .replace("{total}", String(totalCount))}
      </div>

      {/* Card stack */}
      <div
        className="relative w-full max-w-lg md:max-w-xl lg:max-w-2xl mx-auto"
        style={{ minHeight: "320px" }}
      >
        {/* Third card (background preview) */}
        {thirdVacancy && !exitDirection && (
          <div aria-hidden="true">
            <DeckCard vacancy={thirdVacancy} isPreview previewLevel={2} />
          </div>
        )}

        {/* Next card (preview) */}
        {nextVacancy && !exitDirection && (
          <div aria-hidden="true">
            <DeckCard vacancy={nextVacancy} isPreview previewLevel={1} />
          </div>
        )}

        {/* Current card */}
        {currentVacancy && (
          <div
            className="relative z-10 motion-reduce:!transition-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              touchAction: "none",
              transform: isDragging
                ? `translateX(${dragDelta.x}px) translateY(${dragDelta.y}px) rotate(${dragDelta.x * 0.05}deg)`
                : undefined,
              transition: isDragging
                ? "none"
                : "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              cursor: isDragging ? "grabbing" : "grab",
            }}
          >
            <DeckCard
              vacancy={currentVacancy}
              exitDirection={exitDirection}
              onInfoClick={onOpenDetails}
            />

            {/* Swipe overlays */}
            {isDragging && (rightOverlay > 0 || leftOverlay > 0 || upOverlay > 0 || downOverlay > 0) && (
              <div
                className={`absolute inset-0 rounded-xl flex items-center justify-center pointer-events-none ${
                  rightOverlay > leftOverlay && rightOverlay > upOverlay && rightOverlay > downOverlay
                    ? "bg-emerald-500/15 dark:bg-emerald-400/10"
                    : leftOverlay > upOverlay && leftOverlay > downOverlay
                      ? "bg-red-500/15 dark:bg-red-400/10"
                      : downOverlay > upOverlay
                        ? "bg-red-500/15 dark:bg-red-400/10"
                        : "bg-blue-500/15 dark:bg-blue-400/10"
                }`}
                style={{
                  opacity: Math.max(rightOverlay, leftOverlay, upOverlay, downOverlay),
                }}
              >
                {rightOverlay > leftOverlay && rightOverlay > upOverlay && rightOverlay > downOverlay && (
                  <Check className="h-16 w-16 text-emerald-600 dark:text-emerald-400 opacity-80" />
                )}
                {leftOverlay > rightOverlay && leftOverlay > upOverlay && leftOverlay > downOverlay && (
                  <X className="h-16 w-16 text-red-600 dark:text-red-400 opacity-80" />
                )}
                {upOverlay > rightOverlay && upOverlay > leftOverlay && upOverlay > downOverlay && (
                  <Star className="h-16 w-16 text-blue-600 dark:text-blue-400 opacity-80" />
                )}
                {downOverlay > rightOverlay && downOverlay > leftOverlay && downOverlay > upOverlay && (
                  <Ban className="h-16 w-16 text-red-600 dark:text-red-400 opacity-80" />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-4 sm:gap-6 mt-6">
        {/* Group 1: Negative actions (Dismiss + Block) */}
        {/* Dismiss */}
        <button
          type="button"
          className={`h-14 w-14 rounded-full bg-red-100 text-red-600 hover:bg-red-200 active:bg-red-300 active:scale-90 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-950/70 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${
            highlightDismiss ? "ring-2 ring-red-500 scale-110" : ""
          }`}
          onClick={() => { setShowSwipeHint(false); dismiss(); setLastAction(t("deck.actionDismissed")); }}
          disabled={isAnimating || !currentVacancy}
          aria-label={t("deck.dismissTooltip")}
          title={t("deck.dismissTooltip")}
        >
          <X className="h-6 w-6" />
        </button>

        {/* Block company */}
        {/* WCAG 2.5.5 AAA (CRIT-Y1): button grown from 40×40 to 44×44. */}
        <button
          type="button"
          className={`ml-1 h-11 w-11 rounded-full bg-red-100/60 text-red-500 hover:bg-red-200 active:bg-red-300 active:scale-90 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${
            highlightBlock ? "ring-2 ring-red-500 scale-110" : ""
          }`}
          onClick={() => { setShowSwipeHint(false); block(); setLastAction(t("deck.actionBlocked")); }}
          disabled={isAnimating || !currentVacancy}
          aria-label={t("deck.blockTooltip")}
          title={t("deck.blockTooltip")}
        >
          <Ban className="h-4 w-4" />
        </button>

        {/* Divider */}
        <div className="h-8 w-px bg-border mx-1" aria-hidden="true" />

        {/* Group 2: Positive actions (Super-Like + Promote) */}
        {/* Super-Like */}
        <button
          type="button"
          className={`h-12 w-12 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 active:bg-blue-300 active:scale-90 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-950/70 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${
            highlightSuperLike ? "ring-2 ring-blue-500 scale-110" : ""
          }`}
          onClick={() => { setShowSwipeHint(false); superLike(); setLastAction(t("deck.actionSuperLiked")); }}
          disabled={isAnimating || !currentVacancy}
          aria-label={t("deck.superLikeTooltip")}
          title={t("deck.superLikeTooltip")}
        >
          <Star className="h-5 w-5" />
        </button>

        {/* Promote */}
        <button
          type="button"
          className={`h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 active:bg-emerald-300 active:scale-90 dark:bg-emerald-950/50 dark:text-emerald-400 dark:hover:bg-emerald-950/70 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${
            highlightPromote ? "ring-2 ring-emerald-500 scale-110" : ""
          }`}
          onClick={() => { setShowSwipeHint(false); promote(); setLastAction(t("deck.actionPromoted")); }}
          disabled={isAnimating || !currentVacancy}
          aria-label={t("deck.promoteTooltip")}
          title={t("deck.promoteTooltip")}
        >
          <Check className="h-7 w-7" />
        </button>

        {/* Divider */}
        <div className="h-8 w-px bg-border mx-1" aria-hidden="true" />

        {/* Group 3: Neutral actions (Skip + Undo) */}
        {/* WCAG 2.5.5 AAA (CRIT-Y1): Skip + Undo grown from 40×40 to 44×44. */}
        {/* Skip */}
        <button
          type="button"
          className="h-11 w-11 rounded-full bg-muted text-muted-foreground hover:bg-accent active:scale-90 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
          onClick={() => { setShowSwipeHint(false); skip(); setLastAction(t("deck.actionSkipped")); }}
          disabled={isAnimating || !currentVacancy}
          aria-label={t("deck.skipTooltip")}
          title={t("deck.skipTooltip")}
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {canUndo && (
          <button
            type="button"
            className="h-11 w-11 rounded-full bg-muted text-muted-foreground hover:bg-accent active:scale-90 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-dashed border-muted-foreground/30"
            onClick={undo}
            disabled={isAnimating}
            aria-label={t("deck.undoTooltip")}
            title={t("deck.undoTooltip")}
          >
            <Undo2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Auto-approve toggle */}
      <label className="flex items-center gap-2 mt-4 text-sm text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          checked={autoApprove}
          onChange={(e) => setAutoApprove(e.target.checked)}
        />
        <span>{t("deck.autoApprove")}</span>
        <span className="text-xs text-muted-foreground/70">— {t("deck.autoApproveHint")}</span>
      </label>

      {/* Swipe hint (mobile only, first card only) */}
      {showSwipeHint && currentIndex === 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground animate-pulse motion-reduce:animate-none sm:hidden">
          &larr; {t("deck.swipeHint")} &rarr;
        </p>
      )}

      {/* Keyboard hints (hidden on mobile) */}
      <div
        className="hidden sm:flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground flex-wrap"
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium font-mono">
            D
          </kbd>
          {t("deck.dismiss")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium font-mono">
            P
          </kbd>
          {t("deck.promote")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium font-mono">
            S
          </kbd>
          {t("deck.superLike")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium font-mono">
            B
          </kbd>
          {t("deck.block")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium font-mono">
            N
          </kbd>
          {t("deck.skip")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium font-mono">
            Z
          </kbd>
          {t("deck.undo")}
        </span>
        {onOpenDetails && (
          <span className="inline-flex items-center gap-1.5">
            <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium font-mono">
              {t("deck.detailsShortcut")}
            </kbd>
            {t("staging.details")}
          </span>
        )}
      </div>

      {/* Screen reader live regions */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {currentVacancy && (
          currentVacancy.matchScore != null
            ? t("deck.cardAnnouncement")
                .replace("{current}", String(currentIndex + 1))
                .replace("{total}", String(totalCount))
                .replace("{title}", currentVacancy.title)
                .replace("{employer}", currentVacancy.employerName ?? "")
                .replace("{location}", currentVacancy.location ?? "")
                .replace("{score}", String(currentVacancy.matchScore))
            : t("deck.cardAnnouncementNoScore")
                .replace("{current}", String(currentIndex + 1))
                .replace("{total}", String(totalCount))
                .replace("{title}", currentVacancy.title)
                .replace("{employer}", currentVacancy.employerName ?? "")
                .replace("{location}", currentVacancy.location ?? "")
        )}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {lastAction}
      </div>

      {/* Super-like celebration fly-in (Stream D / task 3). Mounted as a
          fixed-position sibling so it floats above the deck without
          intercepting swipes — its outer wrapper is pointer-events-none. */}
      <SuperLikeCelebrationHost
        current={celebrations.current}
        queueRemaining={celebrations.queueRemaining}
        dismiss={celebrations.dismiss}
      />
    </div>
  );
});
