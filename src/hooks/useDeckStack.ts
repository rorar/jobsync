"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

export type DeckAction = "dismiss" | "promote" | "superlike" | "block" | "skip";
export type ExitDirection = "left" | "right" | "up" | "down" | null;

/**
 * Actions whose effects can be reversed client-side today.
 *
 * Sprint 2 H-A-02 (Stream B / ADR-030 DeckActionRoutingInvariant follow-up):
 * `useDeckStack` previously pushed EVERY successful action onto the undo
 * stack, but `StagingContainer.handleDeckUndo` only reverses `dismiss`
 * (via `restoreStagedVacancy`). Clicking Undo after a promote / superlike /
 * block resurrected the card visually (`setCurrentIndex(entry.index)`) while
 * the server-side aggregate stayed committed — the user then re-swiped the
 * "ghost" card and got a silent rollback because the server precondition
 * had already transitioned past "staged". This is the "undo theatre" bug.
 *
 * Per the skill's "fail loud at contract drift" guidance, the cleanest fix
 * is to pin the honest contract at the shape level: only actions that the
 * container can actually reverse belong on the stack. `dismiss` is the only
 * such action today (its reversal is `restoreStagedVacancy`, which
 * transitions `dismissed → staged`). Once `promote`, `superlike`, and
 * `block` gain real server-side compensation (see M-A-09 / `undoStore`
 * integration), this allowlist grows — the constant is the single source
 * of truth, tests pin it, and nothing else in the hook encodes the rule.
 *
 * NOTE: this is a narrower contract than the generic `{ success: true }`
 * return shape from `onAction`, which is intentional. The `success` flag
 * reports server-side outcome; reversibility is a separate property owned
 * by the client state machine. Conflating the two is what produced the bug.
 */
export const REVERSIBLE_DECK_ACTIONS = ["dismiss"] as const;
export type ReversibleDeckAction = (typeof REVERSIBLE_DECK_ACTIONS)[number];

function isReversibleAction(action: DeckAction): action is ReversibleDeckAction {
  return (REVERSIBLE_DECK_ACTIONS as readonly DeckAction[]).includes(action);
}

interface UndoEntry {
  vacancy: StagedVacancyWithAutomation;
  /**
   * Only reversible actions are recorded — see `REVERSIBLE_DECK_ACTIONS`
   * and the H-A-02 comment above. Narrowing the type here is load-bearing:
   * it prevents `undo()` from even attempting to reverse a `promote` or
   * `block` because the entry simply never exists.
   */
  action: ReversibleDeckAction;
  index: number;
  /**
   * Set when the action was a successful super-like (or promote) and the
   * server action surfaced the newly created Job's id. Used by the
   * super-like celebration host to drop the matching celebration when the
   * user undoes the super-like.
   *
   * NOTE: superlike and promote are currently NOT in
   * `REVERSIBLE_DECK_ACTIONS`, so this field is effectively dead code today.
   * It is kept on the entry shape for forward-compatibility with M-A-09's
   * `undoStore` integration, at which point promote/superlike become
   * reversible and this id becomes load-bearing again.
   */
  createdJobId?: string;
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
  /**
   * Server-action dispatcher invoked when the user takes a deck action. The
   * promise must resolve to `{ success }`; on `superlike` / `promote` it may
   * additionally include `createdJobId` so the deck can hand the new Job's id
   * downstream (e.g. to the super-like celebration fly-in).
   */
  onAction: (
    vacancy: StagedVacancyWithAutomation,
    action: DeckAction,
  ) => Promise<{ success: boolean; createdJobId?: string }>;
  onUndo?: (entry: UndoEntry) => Promise<void>;
  enabled?: boolean;
  /**
   * When `true`, the hook's keyboard shortcuts (dismiss/promote/super-like/
   * block/skip/undo) are suppressed. The detail sheet owner is responsible for
   * handling its own keyboard events while open. Defaults to `false`.
   */
  isDetailsOpen?: boolean;
  /**
   * Fired after a successful super-like action whose server response surfaced
   * a `createdJobId`. The host (e.g. `DeckView`) uses this to enqueue a
   * celebration entry. Optional — no-op if omitted.
   */
  onSuperLikeSuccess?: (jobId: string, vacancy: StagedVacancyWithAutomation) => void;
  /**
   * Fired when an undo reverses a previous super-like, so consumers can
   * remove the matching celebration (the created Job no longer exists).
   * Note: undo currently only persists for `dismiss`; this callback is wired
   * for forward-compatibility once super-like undo is implemented end-to-end.
   */
  onSuperLikeUndone?: (jobId: string) => void;
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
  isDetailsOpen = false,
  onSuperLikeSuccess,
  onSuperLikeUndone,
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
      const actionPromise: Promise<{ success: boolean; createdJobId?: string }> =
        action === "skip"
          ? Promise.resolve({ success: true })
          : onAction(vacancy, action).catch(
              (error): { success: boolean; createdJobId?: string } => {
                console.error(`[useDeckStack] Action "${action}" failed:`, error);
                return { success: false };
              },
            );

      // 3. After animation delay, check result
      setTimeout(async () => {
        const result = await actionPromise;

        if (result.success) {
          // H-A-02: only record actions the container can actually reverse.
          // See `REVERSIBLE_DECK_ACTIONS` for the honest allowlist. Skip is
          // intentionally excluded because it has no server-side effect;
          // promote/superlike/block are excluded because `handleDeckUndo`
          // has no compensating action for them today. Recording them
          // anyway produced the "undo theatre" symptom where the card
          // visually returned but the server state stayed committed.
          if (isReversibleAction(action)) {
            const entry: UndoEntry = {
              vacancy,
              action,
              index,
              createdJobId: result.createdJobId,
            };
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

          // Notify host of a successful super-like so it can enqueue the
          // celebration fly-in. Only fires when the server action surfaced a
          // createdJobId — silently no-ops otherwise (e.g. promote-only flow).
          if (action === "superlike" && result.createdJobId) {
            onSuperLikeSuccess?.(result.createdJobId, vacancy);
          }

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
    [currentVacancy, currentIndex, onAction, onSuperLikeSuccess],
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

    // Reverse stats. Today `entry.action` is narrowed to
    // `ReversibleDeckAction` (only `"dismiss"`), so the other branches are
    // dead code — but they are kept so the type expansion (M-A-09 / undoStore
    // integration) just works when promote/superlike/block become reversible.
    setStats((prev) => ({
      ...prev,
      promoted:
        prev.promoted - ((entry.action as DeckAction) === "promote" ? 1 : 0),
      dismissed: prev.dismissed - (entry.action === "dismiss" ? 1 : 0),
      superLiked:
        prev.superLiked - ((entry.action as DeckAction) === "superlike" ? 1 : 0),
      blocked:
        prev.blocked - ((entry.action as DeckAction) === "block" ? 1 : 0),
      skipped: prev.skipped - ((entry.action as DeckAction) === "skip" ? 1 : 0),
    }));

    // If we just undid a super-like with a known createdJobId, drop the
    // matching celebration so the user does not see a CTA pointing at a Job
    // that no longer exists. Today `superlike` is NOT reversible so this
    // branch is unreachable — kept for forward-compatibility with M-A-09.
    if ((entry.action as DeckAction) === "superlike" && entry.createdJobId) {
      onSuperLikeUndone?.(entry.createdJobId);
    }

    if (onUndo) {
      onUndo(entry).catch((error) => {
        console.error("[useDeckStack] Undo failed:", error);
      });
    }
  }, [undoStack, onUndo, onSuperLikeUndone]);

  // Keyboard shortcuts — only when container is focused and not in an input
  useEffect(() => {
    if (!enabled) return;
    // Gate all deck-wide shortcuts while the detail sheet is open so the user
    // can type / scroll inside the sheet without triggering card actions.
    if (isDetailsOpen) return;

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
  }, [enabled, isDetailsOpen, dismiss, promote, superLike, block, skip, undo]);

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
