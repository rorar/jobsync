"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "@/i18n";
import { toast } from "@/components/ui/use-toast";
import type { ActionResult } from "@/models/actionResult";

type ServerAction = (id: string) => Promise<ActionResult<unknown>>;
type Handler = (id: string) => Promise<void>;

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
      return handler;
    },
    [],
  );

  return { createHandler };
}
