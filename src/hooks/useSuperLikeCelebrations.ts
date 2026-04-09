"use client";

import { useCallback, useState } from "react";

/**
 * A single super-like celebration entry waiting to be (or currently being)
 * shown to the user. Identified by `jobId` so undo paths can remove the
 * matching celebration when the user reverses a super-like.
 *
 * @see /home/pascal/projekte/jobsync/.team-feature/consult-task3-superlike-flyin.md
 */
export interface CelebrationItem {
  /** Unique identifier — equal to `jobId` so callers can deduplicate by jobId. */
  id: string;
  /** The newly created Job's id (navigate target for the "Open job" CTA). */
  jobId: string;
  /** Human-readable subtitle (the source vacancy's title). */
  vacancyTitle: string;
  /** Wall-clock time the celebration was enqueued (for FIFO ordering / debug). */
  addedAt: number;
}

/** Maximum size of the celebration FIFO queue. Older entries are dropped silently. */
const QUEUE_CAP = 5;

export interface UseSuperLikeCelebrationsReturn {
  /** All currently queued celebrations (oldest-first). */
  items: CelebrationItem[];
  /** The celebration that should currently be visible to the user, or `null`. */
  current: CelebrationItem | null;
  /** Number of celebrations queued *behind* the current one (for the "+N more" badge). */
  queueRemaining: number;
  /** Enqueue a new celebration (called from `onSuperLikeSuccess`). */
  add: (entry: { jobId: string; vacancyTitle: string }) => void;
  /** Dismiss a single celebration by id. */
  dismiss: (id: string) => void;
  /** Remove any queued celebration matching `jobId` (used by undo paths). */
  removeByJobId: (jobId: string) => void;
}

/**
 * FIFO queue state for super-like celebrations.
 *
 * The queue is a simple `useState<CelebrationItem[]>` capped at `QUEUE_CAP`
 * entries. The oldest entry is always shown first; the host renders the
 * `current` item and the count of items waiting behind it.
 *
 * Timer / auto-dismiss / pause-on-hover logic lives inside the
 * `SuperLikeCelebration` component itself, not in this hook — keeping the
 * queue model purely declarative.
 */
export function useSuperLikeCelebrations(): UseSuperLikeCelebrationsReturn {
  const [items, setItems] = useState<CelebrationItem[]>([]);

  const add = useCallback((entry: { jobId: string; vacancyTitle: string }) => {
    setItems((prev) => {
      // Deduplicate by jobId — re-super-liking the same job (extremely unlikely
      // through the deck flow, but possible via undo+redo) should not stack
      // duplicate celebrations for the same Job.
      const filtered = prev.filter((item) => item.jobId !== entry.jobId);
      const next: CelebrationItem[] = [
        ...filtered,
        {
          id: entry.jobId,
          jobId: entry.jobId,
          vacancyTitle: entry.vacancyTitle,
          addedAt: Date.now(),
        },
      ];
      // Drop the oldest entries when over capacity (FIFO drop from the front).
      return next.length > QUEUE_CAP ? next.slice(next.length - QUEUE_CAP) : next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const removeByJobId = useCallback((jobId: string) => {
    setItems((prev) => prev.filter((item) => item.jobId !== jobId));
  }, []);

  const current = items[0] ?? null;
  const queueRemaining = Math.max(0, items.length - 1);

  return { items, current, queueRemaining, add, dismiss, removeByJobId };
}
