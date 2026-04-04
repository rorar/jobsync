"use client";

import { useEffect, useCallback, useRef } from "react";
import { undoLastAction } from "@/actions/undo.actions";
import { useTranslations } from "@/i18n";
import { toast } from "@/components/ui/use-toast";

/**
 * Listens for Ctrl+Z / Cmd+Z globally and calls undoLastAction().
 * Skips when the active element is an input, textarea, or contenteditable.
 */
export function useGlobalUndo() {
  const { t } = useTranslations();
  const pendingRef = useRef(false);

  const handleUndo = useCallback(async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      const result = await undoLastAction();
      if (result.success) {
        toast({
          variant: "success",
          title: t("undo.actionUndone"),
        });
      } else {
        toast({
          variant: "default",
          title: t("undo.nothingToUndo"),
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("undo.undoFailed"),
      });
    } finally {
      pendingRef.current = false;
    }
  }, [t]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only trigger on Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
      const isUndo = (e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey;
      if (!isUndo) return;

      // Skip if focus is in a text input, textarea, or contenteditable element
      const el = document.activeElement;
      if (el) {
        const tag = el.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        if (
          (el as HTMLElement).isContentEditable ||
          (el as HTMLElement).getAttribute("contenteditable") === "true"
        ) return;
      }

      e.preventDefault();
      handleUndo();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo]);
}
