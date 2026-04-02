"use client";

import { useTranslations } from "@/i18n";
import { toast } from "@/components/ui/use-toast";
import type { ActionResult } from "@/models/actionResult";

type ServerAction = (id: string) => Promise<ActionResult<unknown>>;

/**
 * Factory hook for staging action handlers.
 *
 * Each handler follows the same pattern: call server action, toast
 * success/error, reload data on success.  Instead of five nearly-identical
 * async functions, callers build handlers via `createHandler`.
 */
export function useStagingActions(reload: () => Promise<void>) {
  const { t } = useTranslations();

  function createHandler(action: ServerAction, successKey: string) {
    return async (id: string) => {
      const result = await action(id);
      if (result.success) {
        toast({ variant: "success", description: t(successKey) });
        await reload();
      } else {
        toast({
          variant: "destructive",
          title: t("staging.error"),
          description: result.message,
        });
      }
    };
  }

  return { createHandler };
}
