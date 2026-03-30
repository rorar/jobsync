"use client";

import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import { useTranslations } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock } from "lucide-react";

interface RunStatusBadgeProps {
  automationId: string;
}

export function RunStatusBadge({ automationId }: RunStatusBadgeProps) {
  const { t } = useTranslations();
  const { isAutomationRunning, state } = useSchedulerStatus();

  if (isAutomationRunning(automationId)) {
    return (
      <Badge variant="default" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t("automations.running")}
      </Badge>
    );
  }

  const entry = state?.pendingAutomations.find(
    (p) => p.automationId === automationId,
  );
  if (entry) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        {t("automations.queued")} ({entry.position}/{entry.total})
      </Badge>
    );
  }

  return null;
}
