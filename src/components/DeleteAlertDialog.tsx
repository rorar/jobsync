import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { buttonVariants } from "./ui/button";
import { useTranslations } from "@/i18n";
import { useEffect, useRef, type RefObject } from "react";

interface DeleteAlertDialogProps {
  pageTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  alertTitle?: string;
  alertDescription?: string;
  deleteAction?: boolean;
  /**
   * Where to send focus when the dialog closes and the control that opened it
   * no longer exists — which is the normal case here, because a successful
   * delete removes the row holding that button. Optional: when the opener
   * survives (the user cancelled, or the delete was refused), focus returns to
   * it and this is not consulted.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

export function DeleteAlertDialog({
  pageTitle,
  open,
  onOpenChange,
  onDelete,
  alertTitle,
  alertDescription,
  deleteAction = true,
  returnFocusTo,
}: DeleteAlertDialogProps) {
  const { t } = useTranslations();

  // Every caller opens this dialog through the `open` prop rather than an
  // AlertDialogTrigger, so Radix has no trigger element to restore focus to —
  // it falls back to whatever was focused before, i.e. the row's delete button.
  // A successful delete unmounts that row, and focus lands on document.body: a
  // keyboard user is silently returned to the top of the page.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) openerRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          // Still on the page — Radix's own restore is right, leave it alone.
          if (opener && document.contains(opener)) return;
          const fallback = returnFocusTo?.current;
          if (!fallback) return;
          event.preventDefault();
          fallback.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {alertTitle ?? t("common.deleteConfirmTitle").replace("{item}", pageTitle)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {alertDescription ?? t("common.deleteConfirmDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/*
            When `deleteAction` is false the delete was REFUSED — the row is
            still referenced — and this dialog is a message, not a question.
            Labelling its only button "Cancel" then asks the user to cancel
            something that already did not happen, and leaves them looking for
            the confirm button that is deliberately absent. "Close" says what
            the button does. Same element either way, so focus handling and the
            Escape key are unchanged.
          */}
          <AlertDialogCancel>
            {deleteAction ? t("common.cancel") : t("common.close")}
          </AlertDialogCancel>
          {deleteAction && (
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={onDelete}
            >
              {t("common.delete")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
