"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "@/i18n";
import { toast } from "@/components/ui/use-toast";
import type { ActionResult } from "@/models/actionResult";

type ServerAction = (id: string) => Promise<ActionResult<unknown>>;
type Handler = (id: string) => Promise<void>;

/**
 * Defensive upper bound on the (action, successKey) → handler cache.
 *
 * Sprint 4 Stream B follow-up: Sprint 3 introduced the handler cache as a
 * ref-held `Map<ServerAction, Map<string, Handler>>`. Today every caller
 * passes one of 5 module-level-stable server-action imports with a small
 * set of successKey strings, so the cache is bounded in practice at ~5
 * entries for the entire app lifetime. Safe as-is.
 *
 * BUT: if a future refactor introduces a dynamic action factory (e.g.
 * `createHandler(async (id) => dispatch({ type: "dismiss", id }), ...)`
 * where the lambda is constructed in render), every render would push a
 * NEW action reference into the outer Map and the cache would grow
 * unbounded. The skill's "simplicity over complexity" principle suggests
 * picking the least-invasive guard that catches the dynamic-factory
 * regression:
 *
 *   Option A — TTL eviction: wall-clock timer per entry. Rejected: adds
 *     setTimeout bookkeeping, entries can expire WHILE a paint is mid-
 *     flight if the user is idle, and the TTL window is arbitrary.
 *
 *   Option B — Hard max size, FIFO eviction: simple counter + oldest-key
 *     drop. Picked: O(1) on every insert, deterministic behaviour, no
 *     timer state, and a 20-entry ceiling is 4x the current practical
 *     working set — plenty of headroom for legitimate growth, hard
 *     enough to surface a dynamic-factory bug as "handlers keep getting
 *     re-created" rather than silent leak.
 *
 *   Option C — LRU eviction: same complexity as FIFO for our access
 *     pattern (we always hit the same keys). Equivalent to Option B.
 *
 * The ceiling is intentionally loose. If it ever trips, the log warning
 * (the `else` branch below) is the "fail loud" signal that a dynamic
 * factory snuck into a caller — fix the caller, don't bump the ceiling.
 */
const HANDLER_CACHE_MAX_ENTRIES = 20;

/**
 * Factory hook for staging action handlers.
 *
 * Each handler follows the same pattern: call server action, toast
 * success/error, reload data on success.  Instead of five nearly-identical
 * async functions, callers build handlers via `createHandler`.
 *
 * M-P-03 (Sprint 3 Stream F) — closure stability:
 * The previous implementation returned a fresh handler closure on every
 * call, so `StagingContainer`'s five `createHandler(...)` calls produced
 * five NEW functions on every parent re-render. That invalidated the
 * `StagedVacancyCard` `React.memo` (the handler props changed identity
 * every render, forcing all 20-50 cards to re-render on every reload).
 *
 * The fix has three layers:
 *   1. `createHandler` itself is wrapped in `useCallback([])` so the
 *      factory function is stable across renders.
 *   2. A `Map<ServerAction, Handler>` cache (stored in a ref) memoizes
 *      the RETURNED handler per unique server-action identity. Repeated
 *      `createHandler(dismissStagedVacancy, ...)` calls across renders
 *      return the SAME handler reference as long as the server-action
 *      module import is stable — which it always is, because the action
 *      is a module-level named import.
 *   3. The cached handler closes over refs (`tRef`, `reloadRef`) rather
 *      than the raw values. When `t` or `reload` change identity (e.g.
 *      `t` changes on locale switch), the latest values are read
 *      through the refs without invalidating the handler cache. This
 *      preserves memoization across locale changes while still
 *      reflecting the current language in toast messages.
 *
 * The cache keys off `(action, successKey)` as a composite — if the
 * same server action is registered with a different success key the
 * second call returns a distinct handler. In practice callers always
 * pair one action with one key, so the cache is effectively keyed by
 * `action`.
 */
export function useStagingActions(reload: () => Promise<void>) {
  const { t } = useTranslations();

  // Refs let the cached handlers read the latest `t` / `reload`
  // without invalidating the handler cache on every render.
  const tRef = useRef(t);
  tRef.current = t;
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  // Cache is keyed by server action identity → { successKey → handler }.
  // A nested Map handles the edge case where the same action is used
  // with different success keys across the component tree.
  const handlerCacheRef = useRef<
    Map<ServerAction, Map<string, Handler>>
  >(new Map());

  // Sprint 4 Stream B follow-up: running count of cached handlers across
  // ALL (action, successKey) pairs. Used to enforce
  // `HANDLER_CACHE_MAX_ENTRIES` as a defensive eviction guard against a
  // future dynamic-action-factory caller. See the constant docstring at
  // the top of the file for the full rationale and rejected alternatives.
  //
  // We track the count explicitly (rather than summing `.size` on every
  // insert) so the eviction check is O(1). The count is kept in sync
  // anywhere we mutate the cache — insertions bump it, the FIFO eviction
  // branch decrements it via `byAction.delete` + count--.
  const handlerCacheCountRef = useRef<number>(0);

  const createHandler = useCallback(
    (action: ServerAction, successKey: string): Handler => {
      const byAction = handlerCacheRef.current;
      let bySuccessKey = byAction.get(action);
      if (!bySuccessKey) {
        bySuccessKey = new Map();
        byAction.set(action, bySuccessKey);
      }
      const cached = bySuccessKey.get(successKey);
      if (cached) return cached;

      // FIFO eviction guard (Sprint 4 Stream B follow-up): if the cache
      // has already reached `HANDLER_CACHE_MAX_ENTRIES`, drop the oldest
      // top-level action entry before inserting the new handler. Map
      // iteration preserves insertion order, so `keys().next().value` IS
      // the oldest. We drop the whole inner sub-map for the evicted
      // action — if that action is still in use, the next
      // `createHandler(oldAction, ...)` call will simply rebuild a fresh
      // entry (correct, but logs a `[useStagingActions]` warning so the
      // churn is observable).
      //
      // Note: evicting a top-level action may drop MULTIPLE inner
      // handlers at once (if the same action was paired with several
      // successKeys). The counter is updated by the exact `.size` of the
      // dropped inner map so bookkeeping stays honest.
      if (handlerCacheCountRef.current >= HANDLER_CACHE_MAX_ENTRIES) {
        const oldestKey = byAction.keys().next().value;
        if (oldestKey !== undefined) {
          const dropped = byAction.get(oldestKey);
          const droppedSize = dropped ? dropped.size : 0;
          byAction.delete(oldestKey);
          handlerCacheCountRef.current = Math.max(
            0,
            handlerCacheCountRef.current - droppedSize,
          );
          // Fail-loud signal: if this branch ever fires in production
          // it means a caller is leaking action identities (e.g. a
          // dynamic factory in render). The warning is the trigger to
          // investigate the caller, NOT to bump HANDLER_CACHE_MAX_ENTRIES.
          console.warn(
            "[useStagingActions] Handler cache reached max entries — evicting oldest action. " +
              "This usually indicates a dynamic action factory leaking references across renders.",
            { droppedSize, maxEntries: HANDLER_CACHE_MAX_ENTRIES },
          );
          // Re-seed `bySuccessKey` if the eviction dropped the entry we
          // just allocated above. Because the new action was inserted
          // BEFORE the eviction pass (when we called
          // `byAction.set(action, bySuccessKey)` above in the "not in
          // cache" branch), the eviction can NEVER target it — the
          // newly-inserted action is the youngest key, and FIFO drops
          // the oldest. The re-lookup is defensive: if that invariant
          // ever changes, we notice via missing-handler bugs rather
          // than silent memory growth.
          if (!byAction.has(action)) {
            byAction.set(action, bySuccessKey);
          }
        }
      }

      const handler: Handler = async (id: string) => {
        const result = await action(id);
        if (result.success) {
          toast({
            variant: "success",
            description: tRef.current(successKey),
          });
          await reloadRef.current();
        } else {
          toast({
            variant: "destructive",
            title: tRef.current("staging.error"),
            description: result.message,
          });
        }
      };
      bySuccessKey.set(successKey, handler);
      handlerCacheCountRef.current += 1;
      return handler;
    },
    [],
  );

  return { createHandler };
}
