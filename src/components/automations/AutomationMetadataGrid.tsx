"use client";

import { formatDateCompact, useTranslations } from "@/i18n";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  FileText,
  AlertTriangle,
} from "lucide-react";
import type { AutomationWithResume } from "@/models/automation.model";
import type { DiscoveredJob } from "@/models/automation.model";

interface AutomationMetadataGridProps {
  automation: AutomationWithResume;
  resumeMissing: boolean;
  jobs: DiscoveredJob[];
  newJobsCount: number;
}

export function AutomationMetadataGrid({
  automation,
  resumeMissing,
  jobs,
  newJobsCount,
}: AutomationMetadataGridProps) {
  const { t, locale } = useTranslations();

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t("automations.statusHeader")}</p>
            <Badge
              variant={
                automation.status === "active" ? "default" : "secondary"
              }
              className="mt-1 capitalize"
            >
              {automation.status}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("automations.jobBoard")}</p>
            <p className="font-medium capitalize">{automation.jobBoard}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("automations.matchThreshold")}</p>
            <p className="font-medium">{automation.matchThreshold}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("automations.stepSchedule")}</p>
            <p className="font-medium flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {automation.scheduleHour.toString().padStart(2, "0")}:00 {t("automations.daily").toLowerCase()}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("automations.resumeLabel")}</p>
            {resumeMissing ? (
              <p className="text-amber-600 flex items-center gap-1 text-sm">
                <AlertTriangle className="h-4 w-4" />
                {t("automations.resumeMissing")}
              </p>
            ) : (
              <p className="font-medium flex items-center gap-1">
                <FileText className="h-4 w-4" />
                {automation.resume.title}
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("automations.nextRun")}</p>
            <p className="font-medium">
              {automation.nextRunAt && automation.status === "active"
                ? formatDateCompact(new Date(automation.nextRunAt), locale)
                : "-"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("automations.lastRun")}</p>
            <p className="font-medium">
              {automation.lastRunAt
                ? formatDateCompact(new Date(automation.lastRunAt), locale)
                : t("automations.never")}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("automations.discoveredJobs")}</p>
            <p className="font-medium">
              {jobs.length} {t("automations.total")}
              {newJobsCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {newJobsCount} {t("automations.new").toLowerCase()}
                </Badge>
              )}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
