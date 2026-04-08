"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

export type DeckAction = "dismiss" | "promote" | "superlike" | "block" | "skip";
export type ExitDirection = "left" | "right" | "up" | "down" | null;

interface UndoEntry {
  vacancy: StagedVacancyWithAutomation;
  action: DeckAction;
  index: number;
}

interface DeckStats {
  promoted: number;
  dismissed: number;
  superLiked: number;
  blocked: number;
  skipped: number;
}

interface UseDeckStackOptions {
  vacancies: StagedVacancyWithAutomation[];
  onAction: (vacancy: StagedVacancyWithAutomation, action: DeckAction) => Promise<{ success: boolean }>;
  onUndo?: (entry: UndoEntry) => Promise<void>;
  enabled?: boolean;
}

interface UseDeckStackReturn {
  currentIndex: number;
  currentVacancy: StagedVacancyWithAutomation | null;
  nextVacancy: StagedVacancyWithAutomation | null;
  thirdVacancy: StagedVacancyWithAutomation | null;
  exitDirection: ExitDirection;
  isAnimating: boolean;
  canUndo: boolean;
  stats: DeckStats;
  totalCount: number;
  remainingCount: number;
  isSessionComplete: boolean;
  dismiss: () => void;
  promote: () => void;
  superLike: () => void;
  block: () => void;
  skip: () => void;
  undo: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const MAX_UNDO_STACK = 5;
const ANIMATION_DURATION = 300;

export function useDeckStack({
  vacancies,
  onAction,
  onUndo,
  enabled = true,
}: UseDeckStackOptions): UseDeckStackReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitDirection, setExitDirection] = useState<ExitDirection>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [stats, setStats] = useState<DeckStats>({ promoted: 0, dismissed: 0, superLiked: 0, blocked: 0, skipped: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animatingRef = useRef(false);

  const currentVacancy = vacancies[currentIndex] ?? null;
  const nextVacancy = vacancies[currentIndex + 1] ?? null;
  const thirdVacancy = vacancies[currentIndex + 2] ?? null;
  const totalCount = vacancies.length;
  const remainingCount = totalCount - currentIndex;
  const isSessionComplete = currentIndex >= totalCount && totalCount > 0;

  const performAction = useCallback(
    (action: DeckAction) => {
      if (animatingRef.current || !currentVacancy) return;
      animatingRef.current = true;
      setIsAnimating(true);

      const direction: ExitDirection =
        action === "dismiss" ? "left"
          : action === "promote" ? "right"
            : action === "block" ? "down"
              : action === "skip" ? "right"
                : "up";

      // 1. Start exit animation immediately (optimistic)
      setExitDirection(direction);

      // 2. Fire server action in parallel with animation (skip bypasses onAction)
      const vacancy = currentVacancy;
      const index = currentIndex;
      const actionPromise = action === "skip"
        ? Promise.resolve({ success: true })
        : onAction(vacancy, action).catch(
            (error): { success: boolean } => {
              console.error(`[useDeckStack] Action "${action}" failed:`, error);
              return { success: false };
            },
          );

      // 3. After animation delay, check result
      setTimeout(async () => {
        const result = await actionPromise;

        if (result.success) {
          // Skip has no server-side effect — don't add to undo stack
          if (action !== "skip") {
            const entry: UndoEntry = { vacancy, action, index };
            setUndoStack((prev) => [entry, ...prev].slice(0, MAX_UNDO_STACK));
          }

          setStats((prev) => ({
            ...prev,
            promoted: prev.promoted + (action === "promote" ? 1 : 0),
            dismissed: prev.dismissed + (action === "dismiss" ? 1 : 0),
            superLiked: prev.superLiked + (action === "superlike" ? 1 : 0),
            blocked: prev.blocked + (action === "block" ? 1 : 0),
            skipped: prev.skipped + (action === "skip" ? 1 : 0),
          }));

          setExitDirection(null);
          setCurrentIndex((prev) => prev + 1);
        } else {
          // Rollback: card reappears — don't advance index
          setExitDirection(null);
          // Caller handles error toast via ActionResult
        }

        setIsAnimating(false);
        animatingRef.current = false;
      }, ANIMATION_DURATION);
    },
    [currentVacancy, currentIndex, onAction],
  );

  const dismiss = useCallback(() => performAction("dismiss"), [performAction]);
  const promote = useCallback(() => performAction("promote"), [performAction]);
  const superLike = useCallback(() => performAction("superlike"), [performAction]);
  const block = useCallback(() => performAction("block"), [performAction]);
  const skip = useCallback(() => performAction("skip"), [performAction]);

  const undo = useCallback(async () => {
    if (animatingRef.current || undoStack.length === 0) return;
    const [entry, ...rest] = undoStack;
    setUndoStack(rest);
    setCurrentIndex(entry.index);

    // Reverse stats
    setStats((prev) => ({
      ...prev,
      promoted: prev.promoted - (entry.action === "promote" ? 1 : 0),
      dismissed: prev.dismissed - (entry.action === "dismiss" ? 1 : 0),
      superLiked: prev.superLiked - (entry.action === "superlike" ? 1 : 0),
      blocked: prev.blocked - (entry.action === "block" ? 1 : 0),
      skipped: prev.skipped - (entry.action === "skip" ? 1 : 0),
    }));

    if (onUndo) {
      onUndo(entry).catch((error) => {
        console.error("[useDeckStack] Undo failed:", error);
      });
    }
  }, [undoStack, onUndo]);

  // Keyboard shortcuts — only when container is focused and not in an input
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Only respond when deck container has focus or is an ancestor
      const container = containerRef.current;
      if (!container || !container.contains(target)) return;

      switch (e.key.toLowerCase()) {
        case "d":
        case "arrowleft":
          e.preventDefault();
          dismiss();
          break;
        case "p":
        case "arrowright":
          e.preventDefault();
          promote();
          break;
        case "s":
        case "arrowup":
          e.preventDefault();
          superLike();
          break;
        case "b":
        case "arrowdown":
          e.preventDefault();
          block();
          break;
        case "n":
          e.preventDefault();
          skip();
          break;
        case "z":
          e.preventDefault();
          undo();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, dismiss, promote, superLike, block, skip, undo]);

  return {
    currentIndex,
    currentVacancy,
    nextVacancy,
    thirdVacancy,
    exitDirection,
    isAnimating,
    canUndo: undoStack.length > 0,
    stats,
    totalCount,
    remainingCount,
    isSessionComplete,
    dismiss,
    promote,
    superLike,
    block,
    skip,
    undo,
    containerRef,
  };
}
