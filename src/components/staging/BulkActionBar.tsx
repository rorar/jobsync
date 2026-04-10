"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  XCircle,
  Archive,
  Trash2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { useTranslations } from "@/i18n";
import { executeBulkAction } from "@/actions/stagedVacancy.actions";
import { toast } from "@/components/ui/use-toast";
import { undoAction } from "@/actions/undo.actions";
import type { BulkActionType } from "@/lib/vacancy-pipeline/bulk-action.service";

interface BulkActionBarProps {
  selectedIds: Set<string>;
  activeTab: "new" | "dismissed" | "archive" | "trash";
  onActionComplete: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedIds,
  activeTab,
  onActionComplete,
  onClearSelection,
}: BulkActionBarProps) {
  const { t } = useTranslations();
  const count = selectedIds.size;

  /*
   * M-NEW-02 (Sprint 3 Stream G) — WCAG 3.3.4 Level AA "Error Prevention
   * (Legal, Financial, Data)" requires destructive data actions to be
   * reversible, auto-checked, OR confirmed. Hard delete is not
   * reversible (no undo token issued) and not auto-checked, so the
   * confirmation path is the only compliant option. We gate the delete
   * action on a Radix AlertDialog (`<AlertDialog>`), which bakes in
   * modal focus trapping, Escape-to-cancel, and `role="alertdialog"`
   * semantics for assistive tech.
   *
   * State owned locally (not lifted) because the dialog is purely a
   * visual confirmation step — no parent component needs to observe it.
   */
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  if (count === 0) return null;

  const handleAction = async (actionType: BulkActionType) => {
    const ids = Array.from(selectedIds);
    const result = await executeBulkAction(actionType, ids);

    if (result.success && result.data) {
      const { succeeded, totalRequested, undoTokenId } = result.data;
      const description = t("staging.bulkSuccess")
        .replace("{succeeded}", String(succeeded))
        .replace("{total}", String(totalRequested));

      toast({
        variant: "success",
        description,
        action: undoTokenId
          ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const undoResult = await undoAction(undoTokenId);
                  if (undoResult.success) {
                    onActionComplete();
                  }
                }}
              >
                {t("staging.undoAction")}
              </Button>
            )
          : undefined,
      });

      onClearSelection();
      onActionComplete();
    } else {
      toast({
        variant: "destructive",
        title: t("staging.error"),
        description: result.message,
      });
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 mb-3 rounded-lg border bg-muted/50">
      <Badge variant="secondary" className="text-sm">
        {t("staging.selectedCount").replace("{count}", String(count))}
      </Badge>

      <div className="flex items-center gap-1.5 ml-auto flex-wrap">
        {/* New tab actions: Dismiss, Archive, Trash */}
        {activeTab === "new" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => handleAction("dismiss")}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("staging.bulkDismiss")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => handleAction("archive")}
            >
              <Archive className="h-3.5 w-3.5" />
              {t("staging.bulkArchive")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs text-destructive"
              onClick={() => handleAction("trash")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("staging.bulkTrash")}
            </Button>
          </>
        )}

        {/* Dismissed tab actions: Restore, Trash */}
        {activeTab === "dismissed" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => handleAction("restore")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("staging.bulkRestore")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs text-destructive"
              onClick={() => handleAction("trash")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("staging.bulkTrash")}
            </Button>
          </>
        )}

        {/* Archive tab actions: Restore */}
        {activeTab === "archive" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => handleAction("restore")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("staging.bulkRestore")}
          </Button>
        )}

        {/* Trash tab actions: Restore from Trash, Delete Permanently */}
        {activeTab === "trash" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => handleAction("restoreFromTrash")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("staging.bulkRestore")}
            </Button>
            {/*
              M-NEW-02 — Delete Permanently is guarded by an AlertDialog
              (WCAG 3.3.4). Clicking the button only OPENS the dialog; the
              actual `handleAction("delete")` fires from the dialog's
              confirm button below.
            */}
            <Button
              size="sm"
              variant="destructive"
              className="h-7 gap-1 text-xs"
              onClick={() => setIsDeleteConfirmOpen(true)}
              data-testid="bulk-delete-trigger"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("staging.bulkDelete")}
            </Button>
          </>
        )}
      </div>

      {/*
        M-NEW-02 — Radix AlertDialog renders a portal'd modal with
        focus-trap, Escape-to-cancel, and role="alertdialog". Default
        focus lands on the Cancel button (per Radix + WAI-ARIA APG
        "Alert Dialog" recommendation) to make accidental confirms
        harder.
      */}
      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("staging.bulkDeleteConfirmTitle").replace(
                "{count}",
                String(count),
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("staging.bulkDeleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("staging.bulkDeleteConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setIsDeleteConfirmOpen(false);
                await handleAction("delete");
              }}
              data-testid="bulk-delete-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("staging.bulkDeleteConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
