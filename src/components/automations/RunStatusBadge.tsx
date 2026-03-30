"use client";

import { useReducer, useEffect } from "react";
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import { useTranslations } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock } from "lucide-react";

// Shared 1-second timer for ALL RunStatusBadge instances (P-1 perf fix)
// Instead of N intervals for N badges, one shared timer triggers all subscribers
const tickListeners = new Set<() => void>();
let tickInterval: ReturnType<typeof setInterval> | null = null;

function subscribeToTick(cb: () => void) {
  tickListeners.add(cb);
  if (!tickInterval) {
    tickInterval = setInterval(() => {
      for (const fn of tickListeners) fn();
    }, 1000);
  }
  return () => {
    tickListeners.delete(cb);
    if (tickListeners.size === 0 && tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  };
}

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

  // Subscribe to shared tick for elapsed time updates (only while running)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!running) return;
    return subscribeToTick(forceUpdate);
  }, [running]);

  // Compute elapsed time from RunLock.startedAt
  const lock = state?.runningAutomations.find(r => r.automationId === automationId);
  const elapsed = lock ? Math.floor((Date.now() - new Date(lock.startedAt).getTime()) / 1000) : 0;
  const elapsedText = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`;

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
    </span>
  );
}
