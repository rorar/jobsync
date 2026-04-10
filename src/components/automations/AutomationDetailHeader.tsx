"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Pause,
  Play,
  RefreshCw,
  Loader2,
  PlayCircle,
  Pencil,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { parseKeywords, parseLocations } from "@/utils/automation.utils";
import { LocationBadge } from "@/components/ui/location-badge";
import { EscoKeywordBadge } from "@/components/ui/esco-keyword-badge";
import { RunStatusBadge } from "@/components/automations/RunStatusBadge";
import type { AutomationWithResume } from "@/models/automation.model";

interface AutomationDetailHeaderProps {
  automation: AutomationWithResume;
  resumeMissing: boolean;
  actionLoading: boolean;
  runNowLoading: boolean;
  isRunning: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onPauseResume: () => void;
  onRunNow: () => void;
}

export function AutomationDetailHeader({
  automation,
  resumeMissing,
  actionLoading,
  runNowLoading,
  isRunning,
  onRefresh,
  onEdit,
  onPauseResume,
  onRunNow,
}: AutomationDetailHeaderProps) {
  const { t } = useTranslations();

  return (
    <div className="flex items-center gap-4">
      <Button variant="ghost" size="icon-lg" asChild aria-label={t("automations.backToList")}>
        <Link href="/dashboard/automations">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{automation.name}</h1>
          <RunStatusBadge automationId={automation.id} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-foreground">{t("automations.keywords")}:</span>
            {parseKeywords(automation.keywords)
              .map((kw: string) => (
                <EscoKeywordBadge key={kw} keyword={kw} />
              ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-foreground">{t("automations.locationLabel")}:</span>
            {parseLocations(automation.location).map((code) => (
              <LocationBadge
                key={code}
                code={code}
                resolve={automation.jobBoard === "eures" || automation.jobBoard === "arbeitsagentur"}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="icon-lg" onClick={onRefresh} aria-label={t("automations.refresh")}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4 mr-2" aria-hidden="true" />
          {t("automations.edit")}
        </Button>
        <Button
          variant="outline"
          onClick={onPauseResume}
          disabled={actionLoading || resumeMissing}
        >
          {actionLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" />
          ) : automation.status === "active" ? (
            <Pause className="h-4 w-4 mr-2" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4 mr-2" aria-hidden="true" />
          )}
          {automation.status === "active" ? t("automations.pause") : t("automations.resume")}
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  onClick={onRunNow}
                  disabled={
                    runNowLoading || resumeMissing || automation.status === "paused" || isRunning
                  }
                >
                  {runNowLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  {t("automations.runNow")}
                </Button>
              </span>
            </TooltipTrigger>
            {(isRunning || resumeMissing || automation.status === "paused") && (
              <TooltipContent>
                <p>
                  {isRunning
                    ? t("automations.alreadyRunning")
                    : automation.status === "paused"
                      ? t("automations.runNowPaused")
                      : t("automations.runNowResumeMissing")}
                </p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
