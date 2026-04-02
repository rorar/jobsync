"use client";

import { useState, useEffect, useRef } from "react";
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import { useTranslations, formatNumber } from "@/i18n";
import { CheckCircle2, Loader2, Circle } from "lucide-react";
import type { RunPhase, RunProgress } from "@/lib/scheduler/types";

const PHASES: RunPhase[] = ["search", "dedup", "enrich", "match", "save", "finalize"];

// Phase translation key mapping
const PHASE_KEYS = {
  search: "automations.phaseSearch",
  dedup: "automations.phaseDedup",
  enrich: "automations.phaseEnrich",
  match: "automations.phaseMatch",
  save: "automations.phaseSave",
  finalize: "automations.phaseFinalize",
} as const;

interface RunProgressPanelProps {
  automationId: string;
}

function getPhaseCounter(
  phase: RunPhase,
  progress: RunProgress,
  locale: string,
): string {
  switch (phase) {
    case "search":
      return progress.jobsSearched > 0 ? formatNumber(progress.jobsSearched, locale) : "-";
    case "dedup":
      return progress.jobsDeduplicated > 0 ? formatNumber(progress.jobsDeduplicated, locale) : "-";
    case "enrich":
      return progress.jobsProcessed > 0 ? formatNumber(progress.jobsProcessed, locale) : "-";
    case "match":
      return progress.jobsMatched > 0 ? formatNumber(progress.jobsMatched, locale) : "-";
    case "save":
      return progress.jobsSaved > 0 ? formatNumber(progress.jobsSaved, locale) : "-";
    case "finalize":
      return "";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export function RunProgressPanel({ automationId }: RunProgressPanelProps) {
  const { t, locale } = useTranslations();
  const { isAutomationRunning, getActiveProgress } = useSchedulerStatus();

  const [showEnded, setShowEnded] = useState(false);
  const wasRunningRef = useRef(false);

  const running = isAutomationRunning(automationId);

  useEffect(() => {
    if (wasRunningRef.current && !running) {
      setShowEnded(true);
      const timer = setTimeout(() => setShowEnded(false), 3000);
      return () => clearTimeout(timer);
    }
    wasRunningRef.current = running;
  }, [running]);

  if (!running) {
    if (showEnded) {
      return (
        <div className="rounded-lg border border-muted bg-muted/30 p-4 mb-4 text-center text-sm text-muted-foreground">
          {t("automations.runEnded")}
        </div>
      );
    }
    return null;
  }

  const progress = getActiveProgress(automationId);
  if (!progress) {
    // Running but no progress yet -- show initial state
    return (
      <div className="rounded-lg border p-4 mb-4 bg-blue-50/30 dark:bg-blue-950/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {t("automations.runStarted")}
        </div>
      </div>
    );
  }

  const currentPhaseIndex = PHASES.indexOf(progress.phase);
  const currentPhaseLabel = progress ? t(PHASE_KEYS[progress.phase]) : "";

  return (
    <div className="rounded-lg border p-4 mb-4 bg-blue-50/30 dark:bg-blue-950/20">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">{t("automations.runProgress")}</span>
      </div>

      {/* Screen reader announcement for phase changes */}
      <span className="sr-only" aria-live="polite">
        {progress ? `${currentPhaseLabel} (${currentPhaseIndex + 1}/${PHASES.length})` : ""}
      </span>

      {/* Desktop: horizontal stepper */}
      <div
        className="hidden sm:flex items-center gap-1"
        role="progressbar"
        aria-valuenow={currentPhaseIndex + 1}
        aria-valuemin={1}
        aria-valuemax={PHASES.length}
        aria-label={t("automations.runProgress")}
        aria-valuetext={currentPhaseLabel}
      >
        {PHASES.map((phase, i) => {
          const isCompleted = i < currentPhaseIndex;
          const isActive = i === currentPhaseIndex;
          const isPending = i > currentPhaseIndex;

          return (
            <div key={phase} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                {isCompleted && <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />}
                {isActive && (
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                )}
                {isPending && <Circle className="h-5 w-5 text-muted-foreground/30" aria-hidden="true" />}
                <span
                  className={`text-xs ${
                    isActive
                      ? "font-medium text-blue-600 dark:text-blue-400"
                      : isCompleted
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground/50"
                  }`}
                >
                  {t(PHASE_KEYS[phase])}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {getPhaseCounter(phase, progress, locale)}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <div
                  className={`h-px flex-1 mx-1 ${
                    i < currentPhaseIndex ? "bg-green-500" : "bg-muted-foreground/20"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical list */}
      <div
        className="sm:hidden space-y-2"
        role="progressbar"
        aria-valuenow={currentPhaseIndex + 1}
        aria-valuemin={1}
        aria-valuemax={PHASES.length}
        aria-label={t("automations.runProgress")}
        aria-valuetext={currentPhaseLabel}
      >
        {PHASES.map((phase, i) => {
          const isCompleted = i < currentPhaseIndex;
          const isActive = i === currentPhaseIndex;

          return (
            <div key={phase} className="flex items-center gap-2">
              {isCompleted && (
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" aria-hidden="true" />
              )}
              {isActive && (
                <Loader2 className="h-4 w-4 text-blue-500 animate-spin motion-reduce:animate-none flex-shrink-0" aria-hidden="true" />
              )}
              {!isCompleted && !isActive && (
                <Circle className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" aria-hidden="true" />
              )}
              <span
                className={`text-sm flex-1 ${
                  isActive
                    ? "font-medium"
                    : isCompleted
                      ? ""
                      : "text-muted-foreground/50"
                }`}
              >
                {t(PHASE_KEYS[phase])}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {getPhaseCounter(phase, progress, locale)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
