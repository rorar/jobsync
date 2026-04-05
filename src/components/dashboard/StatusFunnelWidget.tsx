"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations, formatNumber } from "@/i18n";
import {
  getStatusDistribution,
  StatusDistribution,
} from "@/actions/job.actions";
import { Briefcase, RefreshCw, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pipeline stages in funnel order.
 * Maps status values to i18n keys and bar colors.
 */
const PIPELINE_STAGES = [
  {
    value: "bookmarked",
    i18nKey: "dashboard.statusBookmarked",
    barColor: "bg-blue-500",
    textColor: "text-blue-700 dark:text-blue-300",
  },
  {
    value: "applied",
    i18nKey: "dashboard.statusApplied",
    barColor: "bg-green-500",
    textColor: "text-green-700 dark:text-green-300",
  },
  {
    value: "interview",
    i18nKey: "dashboard.statusInterview",
    barColor: "bg-yellow-500",
    textColor: "text-yellow-700 dark:text-yellow-300",
  },
  {
    value: "offer",
    i18nKey: "dashboard.statusOffer",
    barColor: "bg-purple-500",
    textColor: "text-purple-700 dark:text-purple-300",
  },
  {
    value: "accepted",
    i18nKey: "dashboard.statusHired",
    barColor: "bg-emerald-500",
    textColor: "text-emerald-700 dark:text-emerald-300",
  },
] as const;

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

  // Build count array aligned with pipeline stages
  const countsForStages =
    state.status === "loaded"
      ? PIPELINE_STAGES.map((stage) => {
          const match = state.data.find(
            (d) => d.statusValue === stage.value,
          );
          return match?.count ?? 0;
        })
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
        {state.status === "loading" && <SkeletonBars />}
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
              {PIPELINE_STAGES.map((stage, i) => {
                const count = countsForStages[i];
                const widthPercent = (count / maxCount) * 100;
                const percentage = totalJobs > 0 ? Math.round((count / totalJobs) * 100) : 0;
                const isDropoff = biggestDropoff === i;
                const tooltipText = `${t(stage.i18nKey)}: ${formatNumber(count, locale)} (${formatNumber(percentage, locale)}%)`;

                return (
                  <div key={stage.value} role="listitem">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-medium w-20 shrink-0 truncate",
                          stage.textColor,
                        )}
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
                            stage.barColor,
                            isDropoff && "ring-2 ring-orange-400 ring-offset-1",
                          )}
                          style={{
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
                    {i < PIPELINE_STAGES.length - 1 && countsForStages[i] > 0 && (
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

/** Skeleton loading state with animated bars */
function SkeletonBars() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading pipeline data">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-20 h-4 bg-muted rounded animate-pulse" />
          <div
            className="h-6 bg-muted rounded animate-pulse"
            style={{ width: `${90 - i * 15}%` }}
          />
        </div>
      ))}
    </div>
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
