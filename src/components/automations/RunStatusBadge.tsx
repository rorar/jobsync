"use client";

import { useState, useEffect } from "react";
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

  const running = isAutomationRunning(automationId);
  const entry = state?.pendingAutomations.find(
    (p) => p.automationId === automationId,
  );

  // Tick counter to force re-render every second while running
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  // Compute elapsed time from RunLock.startedAt
  const lock = state?.runningAutomations.find(r => r.automationId === automationId);
  const elapsed = lock ? Math.floor((Date.now() - new Date(lock.startedAt).getTime()) / 1000) : 0;
  const elapsedText = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`;

  // aria-live announces state changes to screen readers
  const statusText = running
    ? `${t("automations.running")} (${elapsedText})`
    : entry
      ? `${t("automations.queued")} (${entry.position}/${entry.total})`
      : "";

  return (
    <span role="status" aria-live="polite" aria-atomic="true">
      {running && (
        <Badge variant="default" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
          {t("automations.running")} ({elapsedText})
        </Badge>
      )}
      {!running && entry && (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          {t("automations.queued")} ({entry.position}/{entry.total})
        </Badge>
      )}
      {!running && !entry && (
        <span className="sr-only">{statusText}</span>
      )}
    </span>
  );
}
