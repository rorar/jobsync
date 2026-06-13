"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations, formatNumber } from "@/i18n";
import {
  getStatusDistribution,
  StatusDistribution,
} from "@/actions/job.actions";
import { Briefcase, RefreshCw, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORY_SEED, type StatusCategoryKind } from "@/lib/crm/status-categories";
import { stageColorVar } from "@/lib/crm/stage-colors";

/**
 * Pipeline funnel stages — the fixed progression STAGE KINDS (the spec's semantic
 * backbone), NOT hardcoded status values. Counts aggregate every custom status in
 * a stage (Welle 4: semantic anchoring via category.kind). Colour + label derive
 * from the stage, so user-renamed/recoloured stages flow through automatically.
 */
const PIPELINE_KINDS: { kind: StatusCategoryKind; i18nKey: string }[] = [
  { kind: "lead", i18nKey: "jobStatus.stage.lead" },
  { kind: "applied", i18nKey: "jobStatus.stage.applied" },
  { kind: "interviewing", i18nKey: "jobStatus.stage.interviewing" },
  { kind: "offer", i18nKey: "jobStatus.stage.offer" },
  { kind: "won", i18nKey: "jobStatus.stage.won" },
];

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: StatusDistribution[] };

/**
 * Compute the conversion percentage from one stage to the next.
 * Returns null if the "from" count is 0 (avoids divide-by-zero).
 */
function conversionPercent(from: number, to: number): number | null {
  if (from === 0) return null;
  return Math.round((to / from) * 100);
}

/**
 * Find the pipeline stage with the biggest drop-off.
 * Returns the index of the "from" stage, or null if not applicable.
 */
function findBiggestDropoff(counts: number[]): number | null {
  let maxDrop = 0;
  let maxIndex: number | null = null;
  for (let i = 0; i < counts.length - 1; i++) {
    if (counts[i] > 0) {
      const drop = counts[i] - counts[i + 1];
      if (drop > maxDrop) {
        maxDrop = drop;
        maxIndex = i;
      }
    }
  }
  return maxIndex;
}

export default function StatusFunnelWidget() {
  const { t, locale } = useTranslations();
  const [state, setState] = useState<FetchState>({ status: "loading" });

  const fetchData = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await getStatusDistribution();
      if (result.success && result.data) {
        setState({ status: "loaded", data: result.data });
      } else {
        setState({
          status: "error",
          message: result.message ?? "dashboard.fetchStatusDistributionError",
        });
      }
    } catch {
      setState({
        status: "error",
        message: "dashboard.fetchStatusDistributionError",
      });
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aggregate counts per progression STAGE (sum of every status in that stage).
  const countsForStages =
    state.status === "loaded"
      ? PIPELINE_KINDS.map((stage) =>
          state.data
            .filter((d) => d.categoryKind === stage.kind)
            .reduce((sum, d) => sum + d.count, 0),
        )
      : [];

  const maxCount = Math.max(...countsForStages, 1);
  const totalJobs = countsForStages.reduce((a, b) => a + b, 0);
  const isEmpty = totalJobs === 0;

  // Headline insight: conversion from bookmarked to applied
  const headlineConversion =
    !isEmpty && countsForStages[0] > 0
      ? conversionPercent(countsForStages[0], countsForStages[1])
      : null;

  const biggestDropoff =
    !isEmpty ? findBiggestDropoff(countsForStages) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium text-green-600 dark:text-green-400">
              {t("dashboard.pipeline")}
            </CardTitle>
            {state.status === "loaded" && !isEmpty && headlineConversion !== null && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("dashboard.conversionRate").replace(
                  "{percent}",
                  formatNumber(headlineConversion, locale),
                )}{" "}
                → {t("dashboard.statusApplied")}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {state.status === "loading" && <SkeletonBars label={t("common.loading")} />}
        {state.status === "error" && (
          <ErrorState message={t(state.message)} onRetry={fetchData} />
        )}
        {state.status === "loaded" && isEmpty && <EmptyState />}
        {state.status === "loaded" && !isEmpty && (
          <>
            <p className="text-xs text-muted-foreground mb-2 tabular-nums">
              {t("dashboard.totalJobsTracked").replace(
                "{count}",
                formatNumber(totalJobs, locale),
              )}
            </p>
            <div className="space-y-1.5" role="list" aria-label={t("dashboard.pipeline")}>
              {PIPELINE_KINDS.map((stage, i) => {
                const count = countsForStages[i];
                const widthPercent = (count / maxCount) * 100;
                const percentage = totalJobs > 0 ? Math.round((count / totalJobs) * 100) : 0;
                const isDropoff = biggestDropoff === i;
                const tooltipText = `${t(stage.i18nKey)}: ${formatNumber(count, locale)} (${formatNumber(percentage, locale)}%)`;
                const stageColour = CATEGORY_SEED[stage.kind].colour;

                return (
                  <div key={stage.kind} role="listitem">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-medium w-20 shrink-0 truncate"
                        style={{ ...stageColorVar(stageColour), color: "var(--stage-color)" }}
                      >
                        {t(stage.i18nKey)}
                      </span>
                      <div
                        className="flex-1 h-6 bg-muted rounded-sm overflow-hidden relative"
                        title={tooltipText}
                      >
                        <div
                          className={cn(
                            "h-full rounded-sm transition-all duration-500 ease-out",
                            isDropoff && "ring-2 ring-orange-400 ring-offset-1",
                          )}
                          style={{
                            ...stageColorVar(stageColour),
                            backgroundColor: "var(--stage-color)",
                            width: `${Math.max(widthPercent, count > 0 ? 4 : 0)}%`,
                          }}
                          role="meter"
                          aria-label={tooltipText}
                          aria-valuenow={count}
                          aria-valuemin={0}
                          aria-valuemax={maxCount}
                        />
                        <span
                          className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold tabular-nums text-foreground"
                        >
                          {count}
                        </span>
                      </div>
                    </div>
                    {/* Conversion arrow between stages */}
                    {i < PIPELINE_KINDS.length - 1 && countsForStages[i] > 0 && (
                      <div className="flex items-center gap-2 ml-20 pl-2">
                        <span className={cn(
                          "text-[10px] tabular-nums",
                          isDropoff
                            ? "text-orange-500 font-semibold"
                            : "text-muted-foreground",
                        )}>
                          {isDropoff && (
                            <>
                              <TrendingDown className="inline-block w-3 h-3 mr-0.5 -mt-px" aria-hidden="true" />
                              <span className="sr-only">{t("dashboard.biggestDropoff")}: </span>
                            </>
                          )}
                          {formatNumber(conversionPercent(countsForStages[i], countsForStages[i + 1]) ?? 0, locale)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton loading state with animated bars.
 *
 * Sprint 4 Stream E — Sprint 3 Stream G (M-Y-08) follow-up: migrated
 * from the ad-hoc `aria-busy="true" aria-label="Loading pipeline data"`
 * wrapper (hardcoded English) to the shared `Skeleton` primitive. The
 * label arrives from the parent's `useTranslations()` call
 * (`t("common.loading")`) so DE/FR/ES users hear the loading state in
 * their locale. The primitive also adds `role="status"` and
 * `aria-live="polite"` which the old wrapper was missing, bringing the
 * three funnel/history/enrichment skeletons to a consistent ARIA
 * contract.
 */
function SkeletonBars({ label }: { label: string }) {
  return (
    <Skeleton className="space-y-3" label={label}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-20 h-4 bg-muted rounded animate-pulse motion-reduce:animate-none" />
          <div
            className="h-6 bg-muted rounded animate-pulse motion-reduce:animate-none"
            style={{ width: `${90 - i * 15}%` }}
          />
        </div>
      ))}
    </Skeleton>
  );
}

/** Empty state with motivational message */
function EmptyState() {
  const { t } = useTranslations();
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <Briefcase className="w-10 h-10 text-muted-foreground/50 mb-2" />
      <p className="text-sm text-muted-foreground">
        {t("dashboard.noPipeline")}
      </p>
    </div>
  );
}

/** Error state with retry button */
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="w-3.5 h-3.5 mr-1" />
        {t("dashboard.retryButton")}
      </Button>
    </div>
  );
}
