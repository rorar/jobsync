"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/i18n";
import { formatDateCompact } from "@/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from "@/components/ui/use-toast";
import {
  MoreHorizontal,
  Pause,
  Play,
  Pencil,
  Trash2,
  Clock,
  FileText,
  AlertTriangle,
  Info,
  Zap,
} from "lucide-react";
import type { AutomationWithResume, AutomationPauseReason } from "@/models/automation.model";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  deleteAutomation,
  pauseAutomation,
  resumeAutomation,
} from "@/actions/automation.actions";
import Link from "next/link";
import { LocationBadge } from "@/components/ui/location-badge";
import { RunStatusBadge } from "@/components/automations/RunStatusBadge";
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import { parseKeywords, parseLocations } from "@/utils/automation.utils";

interface AutomationListProps {
  automations: AutomationWithResume[];
  onEdit: (automation: AutomationWithResume) => void;
  onRefresh: () => void;
}

/** Map pauseReason values to i18n translation keys */
const PAUSE_REASON_KEYS: Record<AutomationPauseReason, string> = {
  module_deactivated: "automations.pauseReasonModuleDeactivated",
  auth_failure: "automations.pauseReasonAuthFailure",
  consecutive_failures: "automations.pauseReasonConsecutiveFailures",
  cb_escalation: "automations.pauseReasonCbEscalation",
};

import { STATUS_DISPLAY_KEYS, MODULE_DISPLAY_KEYS } from "@/lib/automation-display-keys";

export function AutomationList({
  automations,
  onEdit,
  onRefresh,
}: AutomationListProps) {
  const { t, locale } = useTranslations();
  const router = useRouter();
  const { isAutomationRunning } = useSchedulerStatus();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handlePause = async (id: string) => {
    setLoadingAction(id);
    const result = await pauseAutomation(id);
    setLoadingAction(null);

    if (result.success) {
      toast({ title: t("automations.automationPaused") });
      onRefresh();
    } else {
      toast({
        title: t("automations.validationError"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleResume = async (id: string) => {
    setLoadingAction(id);
    const result = await resumeAutomation(id);
    setLoadingAction(null);

    if (result.success) {
      toast({ title: t("automations.automationResumed") });
      onRefresh();
    } else {
      toast({
        title: t("automations.validationError"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    setIsDeleting(true);
    const result = await deleteAutomation(deleteId);
    setIsDeleting(false);
    setDeleteId(null);

    if (result.success) {
      toast({ title: t("automations.automationDeleted") });
      onRefresh();
    } else {
      toast({
        title: t("automations.validationError"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  if (automations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Zap aria-hidden="true" className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("automations.noAutomations")}</h3>
          <p className="text-muted-foreground text-center mt-2">
            {t("automations.noAutomationsDesc")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {automations.map((automation) => {
          const isLoading = loadingAction === automation.id;
          const resumeMissing = !automation.resume;
          const keywordChips = parseKeywords(automation.keywords);
          const locationCodes = parseLocations(automation.location);
          const isEures = automation.jobBoard === "eures" || automation.jobBoard === "arbeitsagentur";
          const detailHref = `/dashboard/automations/${automation.id}`;

          return (
            <div
              key={automation.id}
              role="article"
              tabIndex={0}
              className={`scroll-mt-14 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                isAutomationRunning(automation.id)
                  ? "border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/20"
                  : ""
              }`}
              onClick={() => router.push(detailHref)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(detailHref); } }}
              aria-label={automation.name}
            >
              <div className="flex items-start justify-between p-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link href={detailHref} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
                      {automation.name}
                    </Link>
                    <Badge variant="outline">
                      {t(MODULE_DISPLAY_KEYS[automation.jobBoard] ?? automation.jobBoard)}
                    </Badge>
                    <Badge
                      variant={automation.status === "active" ? "default" : "secondary"}
                    >
                      {t(STATUS_DISPLAY_KEYS[automation.status] ?? automation.status)}
                    </Badge>
                    <RunStatusBadge automationId={automation.id} />
                    {automation.status === "paused" && automation.pauseReason && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                              <Info aria-hidden="true" className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">
                                {t(PAUSE_REASON_KEYS[automation.pauseReason])}
                              </span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t(PAUSE_REASON_KEYS[automation.pauseReason])}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  {resumeMissing && (
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                      <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                      <span>{t("automations.resumeMissing")}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-foreground">{t("automations.keywords")}:</span>
                      {keywordChips.map((keyword, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-foreground">{t("automations.locationLabel")}:</span>
                      {locationCodes.map((code, idx) => (
                        <LocationBadge key={idx} code={code} resolve={isEures} />
                      ))}
                    </div>
                    {automation.resume && (
                      <span>
                        <span className="font-medium text-foreground">{t("automations.resumeLabel")}:</span>{" "}
                        {automation.resume.title}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock aria-hidden="true" className="h-4 w-4" />
                      <span>
                        {automation.scheduleHour.toString().padStart(2, "0")}:00 {t("automations.daily").toLowerCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText aria-hidden="true" className="h-4 w-4" />
                      <span>{automation.matchThreshold}% {t("automations.threshold").toLowerCase()}</span>
                    </div>
                    {automation.nextRunAt && automation.status === "active" && (
                      <span className="text-sm">
                        {t("automations.nextRun")}: {formatDateCompact(new Date(automation.nextRunAt), locale)}
                      </span>
                    )}
                    {automation.lastRunAt && (
                      <span className="text-sm">
                        {t("automations.lastRun")}: {formatDateCompact(new Date(automation.lastRunAt), locale)}
                      </span>
                    )}
                  </div>
                </div>

                {/* 3 actions (pause/resume + edit + delete) > 2, keep dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isLoading}
                      aria-label={t("automations.actions")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {automation.status === "active" ? (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePause(automation.id); }}>
                        <Pause className="h-4 w-4 mr-2" />
                        {t("automations.pause")}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={(e) => { e.stopPropagation(); handleResume(automation.id); }}
                        disabled={resumeMissing}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        {t("automations.resume")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(automation); }}>
                      <Pencil className="h-4 w-4 mr-2" />
                      {t("automations.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(automation.id); }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t("automations.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("automations.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("automations.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t("automations.deleting") : t("automations.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
