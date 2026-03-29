"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
            <Button
              size="sm"
              variant="destructive"
              className="h-7 gap-1 text-xs"
              onClick={() => handleAction("delete")}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("staging.bulkDelete")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
