"use client";

/**
 * SuperLikeCelebrationsProvider — lifts the celebration queue out of
 * `DeckView`'s lifecycle so it survives navigation.
 *
 * Why this exists (M-A-07, Sprint 3 Stream B)
 * -------------------------------------------
 * `useSuperLikeCelebrations` was originally instantiated INSIDE `DeckView`.
 * When the user clicked "Open job" on a celebration, `router.push` navigated
 * away from the staging page, which unmounted `DeckView`, which destroyed the
 * hook's `useState` and with it every celebration still in the queue.
 * Concretely: queue up 5 rapid super-likes, click Open on the first, lose
 * the remaining 4 silently. The `QUEUE_CAP = 5` invariant in the hook
 * implies "batching is a supported use case", but the old lifecycle contract
 * contradicted that intent.
 *
 * Fix: mount the queue once at the dashboard layout, expose it via context,
 * and let `DeckView` (and any future list-mode promote path) consume the
 * same singleton-per-subtree. Navigation inside the dashboard no longer
 * unmounts the queue because the layout persists across `/dashboard/*`
 * route transitions (Next.js App Router layouts are stable across child
 * page navigations).
 *
 * Aggregate-boundary rationale
 * ----------------------------
 * The skill's "Aggregate Boundaries" principle frames the choice: the
 * celebration queue is a PURE UX layer — it has no identity, no
 * persistence, no invariants that cross other aggregates. It is a transient
 * presentation-layer buffer keyed by `jobId`. That makes it a natural Value
 * Object living at the Aggregate Root of the user's dashboard session
 * (= the dashboard layout). Promoting it higher (to the root layout) would
 * needlessly bind authenticated dashboard UX to unauthenticated pages;
 * keeping it lower (inside `DeckView`) forfeits the forever-promise of the
 * celebration. The dashboard layout is the smallest scope that satisfies
 * the lifecycle contract.
 *
 * Ergonomics
 * ----------
 * The provider is backward-compatible: if a consumer renders without a
 * surrounding `<SuperLikeCelebrationsProvider>`, `useSuperLikeCelebrationsContext`
 * transparently falls back to a locally-scoped queue via the existing
 * `useSuperLikeCelebrations` hook. This keeps existing tests (which mount
 * `DeckView` in isolation) passing without forcing every test to wrap in
 * the provider. In production, the dashboard layout ALWAYS wraps.
 *
 * @see docs/adr/030-deck-action-contract-and-notification-late-binding.md
 * @see specs/vacancy-pipeline.allium `SuperLikeCelebrationLifecycle`
 */

import { createContext, useContext, type ReactNode } from "react";
import {
  useSuperLikeCelebrations,
  type UseSuperLikeCelebrationsReturn,
} from "@/hooks/useSuperLikeCelebrations";

const SuperLikeCelebrationsContext =
  createContext<UseSuperLikeCelebrationsReturn | null>(null);

/**
 * Provider — mounts a single `useSuperLikeCelebrations` queue for the
 * entire subtree. Place at the closest stable-lifetime root of the
 * authenticated UX (today: dashboard layout). Cheap to mount — the hook
 * holds a `useState<CelebrationItem[]>` and three memoized callbacks.
 */
export function SuperLikeCelebrationsProvider({ children }: { children: ReactNode }) {
  const value = useSuperLikeCelebrations();
  return (
    <SuperLikeCelebrationsContext.Provider value={value}>
      {children}
    </SuperLikeCelebrationsContext.Provider>
  );
}

/**
 * Consume the celebration queue. Falls back to a component-local queue if
 * no provider is mounted above — keeps isolated component tests working
 * without forcing a provider wrapper. Production always has the provider.
 *
 * NOTE: the fallback branch ALWAYS calls `useSuperLikeCelebrations()` even
 * when a provider is present, to keep the hook-call order stable across
 * renders. The returned value is the provider's queue when present,
 * otherwise the fallback queue. React's hook-rules guarantee stable order
 * because both branches always run.
 */
export function useSuperLikeCelebrationsContext(): UseSuperLikeCelebrationsReturn {
  const ctx = useContext(SuperLikeCelebrationsContext);
  // Hook order must be stable: always call the fallback hook, then pick.
  const fallback = useSuperLikeCelebrations();
  return ctx ?? fallback;
}
