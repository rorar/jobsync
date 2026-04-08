"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslations } from "@/i18n";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

interface BlockConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vacancy: StagedVacancyWithAutomation | null;
  onConfirm: () => void;
}

export function BlockConfirmationDialog({
  open,
  onOpenChange,
  vacancy,
  onConfirm,
}: BlockConfirmationDialogProps) {
  const { t } = useTranslations();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deck.blockConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deck.blockConfirmDescription").replace("{company}", vacancy?.employerName ?? "")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {t("deck.blockConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
