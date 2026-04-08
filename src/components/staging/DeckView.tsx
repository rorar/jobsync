"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

interface DeckViewProps {
  vacancies: StagedVacancyWithAutomation[];
  onAction: (vacancy: StagedVacancyWithAutomation, action: DeckAction) => Promise<{ success: boolean }>;
  onUndo?: (entry: { vacancy: StagedVacancyWithAutomation; action: DeckAction; index: number }) => Promise<void>;
  onBackToList: () => void;
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

export function DeckView({ vacancies, onAction, onUndo, onBackToList }: DeckViewProps) {
  const { t } = useTranslations();
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const [autoApprove, setAutoApprove] = useState(getAutoApproveDefault);
  const [lastAction, setLastAction] = useState<string>("");
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
  } = useDeckStack({ vacancies, onAction, onUndo });

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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isAnimating || !currentVacancy) return;
    dragStart.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [isAnimating, currentVacancy]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current || !isDragging) return;
    setDragDelta({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
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
  }, [isDragging, dragDelta, promote, dismiss, superLike, block]);

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
            <DeckCard vacancy={currentVacancy} exitDirection={exitDirection} />

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
        <button
          type="button"
          className={`ml-1 h-10 w-10 rounded-full bg-red-100/60 text-red-500 hover:bg-red-200 active:bg-red-300 active:scale-90 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${
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
        {/* Skip */}
        <button
          type="button"
          className="h-10 w-10 rounded-full bg-muted text-muted-foreground hover:bg-accent active:scale-90 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
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
            className="h-10 w-10 rounded-full bg-muted text-muted-foreground hover:bg-accent active:scale-90 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-dashed border-muted-foreground/30"
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
    </div>
  );
}
