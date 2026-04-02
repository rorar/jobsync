"use client";

import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import { useTranslations, formatRelativeTime } from "@/i18n";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

export function SchedulerStatusBar() {
  const { t, locale } = useTranslations();
  const { state, isRunning } = useSchedulerStatus();

  if (!state) return null; // SSE not connected yet

  const activeRun = state.runningAutomations[0];
  const queueCount = state.pendingAutomations.length;
  const phase = state.phase;

  // Determine pill icon and label
  let pillIcon: React.ReactNode;
  let pillLabel: string;
  let pillClasses: string;

  if (phase === "running" || isRunning) {
    pillIcon = <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />;
    pillLabel = activeRun
      ? `"${activeRun.automationName}"`
      : t("automations.schedulerRunning");
    pillClasses =
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300";
  } else {
    pillIcon = <Check className="h-3.5 w-3.5" />;
    pillLabel = t("automations.schedulerIdle");
    pillClasses =
      "border-muted bg-muted/50 text-muted-foreground";
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span aria-live="polite">
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 gap-1.5 rounded-full border px-3 text-xs font-medium ${pillClasses}`}
            aria-label={t("automations.schedulerStatus")}
          >
            {pillIcon}
            <span className="max-w-[120px] truncate">{pillLabel}</span>
            {(phase === "running" || isRunning) && queueCount > 0 && (
              <span
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white dark:bg-blue-500"
                aria-label={t("automations.queuedCount").replace("{count}", String(queueCount))}
              >
                {queueCount}
              </span>
            )}
          </Button>
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-4 space-y-3">
          <h4 className="text-sm font-semibold">
            {t("automations.schedulerStatus")}
          </h4>

          <hr className="border-t" />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("automations.schedulerPhase")}
              </span>
              <span className="font-medium">
                {phase === "running" || isRunning
                  ? t("automations.schedulerPhaseRunning")
                  : t("automations.schedulerIdle")}
              </span>
            </div>

            {activeRun && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("automations.schedulerActive")}
                  </span>
                  <span className="font-medium max-w-[140px] truncate">
                    &quot;{activeRun.automationName}&quot;
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("automations.schedulerModule")}
                  </span>
                  <span className="font-medium capitalize">
                    {activeRun.moduleId}
                  </span>
                </div>
              </>
            )}

            {queueCount > 0 && (
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-muted-foreground">
                    {t("automations.queued")}
                  </span>
                  <span className="font-medium">
                    {queueCount} {t("automations.schedulerQueueRemaining")}
                  </span>
                </div>
                <ol className="space-y-1 pl-4 text-xs text-muted-foreground">
                  {state.pendingAutomations.map((pending, i) => (
                    <li key={pending.automationId}>
                      {i + 1}. &quot;{pending.automationName}&quot;
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {state.lastCycleCompletedAt && (
            <>
              <hr className="border-t" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("automations.schedulerLastCompleted")}
                </span>
                <span className="font-medium">
                  {formatRelativeTime(
                    new Date(state.lastCycleCompletedAt),
                    locale
                  )}
                </span>
              </div>
            </>
          )}

          {!activeRun &&
            queueCount === 0 &&
            !state.lastCycleCompletedAt && (
              <p className="text-xs text-muted-foreground">
                {t("automations.schedulerNoAutomations")}
              </p>
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
