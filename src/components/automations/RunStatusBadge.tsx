"use client";

import { useReducer, useEffect } from "react";
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import { useTranslations } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock } from "lucide-react";

// Shared 1-second timer for ALL RunStatusBadge instances (P-1 perf fix)
// Instead of N intervals for N badges, one shared timer triggers all subscribers.
// Uses globalThis to survive HMR (same pattern as RunCoordinator, EventBus, ConnectorCache).
const GLOBAL_KEY = "__runStatusBadgeTick" as const;

interface TickState {
  interval: ReturnType<typeof setInterval> | null;
  listeners: Set<() => void>;
}

function getTickState(): TickState {
  if (!(GLOBAL_KEY in globalThis)) {
    (globalThis as any)[GLOBAL_KEY] = { interval: null, listeners: new Set() };
  }
  return (globalThis as any)[GLOBAL_KEY];
}

function subscribeToTick(cb: () => void) {
  const state = getTickState();
  state.listeners.add(cb);
  if (!state.interval) {
    state.interval = setInterval(() => {
      for (const fn of state.listeners) fn();
    }, 1000);
  }
  return () => {
    state.listeners.delete(cb);
    if (state.listeners.size === 0 && state.interval) {
      clearInterval(state.interval);
      state.interval = null;
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
  const hour = Math.floor(elapsed / 3600);
  const min = Math.floor((elapsed % 3600) / 60);
  const sec = elapsed % 60;
  const elapsedText = elapsed >= 3600
    ? t("automations.elapsedHourMinSec").replace("{hour}", String(hour)).replace("{min}", String(min)).replace("{sec}", String(sec))
    : elapsed >= 60
      ? t("automations.elapsedMinSec").replace("{min}", String(min)).replace("{sec}", String(sec))
      : t("automations.elapsedSec").replace("{sec}", String(elapsed));

  // Screen reader status - only announces on significant state changes (start/stop), not elapsed time
  const srStatus = running ? t("automations.running") : entry ? t("automations.queued") : "";

  return (
    <span role="status">
      {/* Screen reader announcement - only updates on state change, not every second */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {srStatus}
      </span>
      {running && (
        <Badge variant="default" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("automations.running")} ({elapsedText})
        </Badge>
      )}
      {!running && entry && (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {t("automations.queued")} ({entry.position}/{entry.total})
        </Badge>
      )}
    </span>
  );
}
