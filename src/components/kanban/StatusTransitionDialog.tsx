"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Loader2 } from "lucide-react";
import type { JobResponse, JobStatus } from "@/models/job.model";
import { STATUS_COLORS } from "@/hooks/useKanbanState";

interface StatusTransitionDialogProps {
  open: boolean;
  job: JobResponse | null;
  fromStatus: JobStatus | null;
  toStatus: JobStatus | null;
  onConfirm: (note?: string) => void;
  onCancel: () => void;
  isPending: boolean;
}

export function StatusTransitionDialog({
  open,
  job,
  fromStatus,
  toStatus,
  onConfirm,
  onCancel,
  isPending,
}: StatusTransitionDialogProps) {
  const { t } = useTranslations();
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    onConfirm(note.trim() || undefined);
    setNote("");
  };

  const handleCancel = () => {
    setNote("");
    onCancel();
  };

  const fromColor = STATUS_COLORS[fromStatus?.value ?? ""] ?? STATUS_COLORS.draft;
  const toColor = STATUS_COLORS[toStatus?.value ?? ""] ?? STATUS_COLORS.draft;

  const getStatusLabel = (status: JobStatus | null) => {
    if (!status) return "";
    const key = `jobs.status${status.value.charAt(0).toUpperCase()}${status.value.slice(1)}`;
    const translated = t(key);
    return translated !== key ? translated : status.label;
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("jobs.kanbanMoveTitle")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                {t("jobs.kanbanMoveConfirm")
                  .replace("{title}", job?.JobTitle?.label ?? "")
                  .replace("{from}", getStatusLabel(fromStatus))
                  .replace("{to}", getStatusLabel(toStatus))}
              </p>
              <div className="flex items-center justify-center gap-3">
                <Badge className={`${fromColor.bg} ${fromColor.text} ${fromColor.darkBg} border-0`}>
                  {getStatusLabel(fromStatus)}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Badge className={`${toColor.bg} ${toColor.text} ${toColor.darkBg} border-0`}>
                  {getStatusLabel(toStatus)}
                </Badge>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <label htmlFor="transition-note" className="text-sm text-muted-foreground">
            {t("jobs.kanbanMoveNote")}
          </label>
          <Textarea
            id="transition-note"
            placeholder={t("jobs.kanbanMoveNotePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={isPending}
            className="resize-none"
          />
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none mr-2" aria-hidden="true" />
                {t("jobs.kanbanMoveMoving")}
              </>
            ) : (
              t("jobs.kanbanMoveButton").replace("{status}", getStatusLabel(toStatus))
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
