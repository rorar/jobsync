"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, formatDateShort } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getJobStatusHistory } from "@/actions/job.actions";
import type { StatusHistoryEntry } from "@/actions/job.actions";
import {
  History,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Number of entries fetched per page */
const PAGE_SIZE = 50;

interface StatusHistoryTimelineProps {
  jobId: string;
}

/** Map status value to a consistent color class for badges */
function getStatusColor(value: string | null): string {
  switch (value) {
    case "applied":
      return "bg-cyan-500 text-white";
    case "interview":
      return "bg-green-500 text-white";
    case "offer":
      return "bg-emerald-600 text-white";
    case "accepted":
      return "bg-green-700 text-white";
    case "rejected":
      return "bg-red-500 text-white";
    case "expired":
      return "bg-orange-500 text-white";
    case "archived":
      return "bg-gray-500 text-white";
    case "bookmarked":
      return "bg-yellow-500 text-white";
    case "draft":
      return "bg-slate-400 text-white";
    default:
      return "";
  }
}

/**
 * Sprint 4 Stream E — Sprint 3 Stream G (M-Y-08) follow-up: migrated
 * from an ad-hoc `role="status" aria-label="Loading"` wrapper (hardcoded
 * English) to the shared `Skeleton` primitive. The label arrives from
 * the parent's `useTranslations()` call (`t("common.loading")`) so the
 * loading region announces in the user's locale.
 */
function TimelineSkeleton({ label }: { label: string }) {
  return (
    <Skeleton className="space-y-4" label={label}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="h-3 w-3 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
            {i < 3 && (
              <div className="w-0.5 flex-1 bg-muted animate-pulse motion-reduce:animate-none mt-1" />
            )}
          </div>
          <div className="flex-1 pb-4 space-y-2">
            <div className="h-4 w-40 bg-muted rounded animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-24 bg-muted rounded animate-pulse motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </Skeleton>
  );
}

export function StatusHistoryTimeline({ jobId }: StatusHistoryTimelineProps) {
  const { t, locale } = useTranslations();
  const [entries, setEntries] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await getJobStatusHistory(jobId, PAGE_SIZE, 0);
      if (response.success && response.data) {
        setEntries(response.data);
        setHasMore(response.data.length >= PAGE_SIZE);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const response = await getJobStatusHistory(jobId, PAGE_SIZE, entries.length);
      if (response.success && response.data) {
        setEntries((prev) => [...prev, ...response.data!]);
        setHasMore(response.data.length >= PAGE_SIZE);
      }
    } catch {
      // Silently fail -- user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [jobId, entries.length]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">{t("jobs.statusHistory")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Loading state */}
        {loading && <TimelineSkeleton label={t("common.loading")} />}

        {/* Error state */}
        {!loading && error && (
          <div
            className="flex flex-col items-center gap-3 py-4 text-center"
            role="alert"
          >
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">
              {t("jobs.statusHistoryError")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHistory}
              aria-label={t("jobs.statusHistoryRetry")}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {t("jobs.statusHistoryRetry")}
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <History className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("jobs.statusHistoryEmpty")}
            </p>
          </div>
        )}

        {/* Timeline entries */}
        {!loading && !error && entries.length > 0 && (
          <>
            <div
              className="max-h-80 overflow-y-auto pr-1"
              role="list"
              aria-label={t("jobs.statusHistory")}
            >
              {entries.map((entry, index) => {
                const isLast = index === entries.length - 1;
                const isInitial = !entry.previousStatusValue;

                return (
                  <div
                    key={entry.id}
                    className="flex gap-3"
                    role="listitem"
                  >
                    {/* Timeline connector */}
                    <div className="flex flex-col items-center pt-1">
                      <div
                        className={cn(
                          "h-3 w-3 rounded-full border-2 shrink-0",
                          entry.newStatusValue === "rejected" || entry.newStatusValue === "expired"
                            ? "border-destructive bg-destructive/20"
                            : entry.newStatusValue === "interview" || entry.newStatusValue === "offer" || entry.newStatusValue === "accepted"
                              ? "border-green-500 bg-green-500/20"
                              : "border-primary bg-primary/20",
                        )}
                        role="img"
                        aria-label={entry.newStatusLabel}
                      />
                      {!isLast && (
                        <div className="w-0.5 flex-1 bg-border mt-1 min-h-[1rem]" />
                      )}
                    </div>

                    {/* Entry content */}
                    <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {isInitial ? (
                          <span className="text-sm text-muted-foreground">
                            {t("jobs.statusHistoryInitial")}
                          </span>
                        ) : (
                          <>
                            <Badge
                              variant="outline"
                              className={cn("text-xs", getStatusColor(entry.previousStatusValue))}
                            >
                              {entry.previousStatusLabel}
                            </Badge>
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          </>
                        )}
                        <Badge
                          className={cn("text-xs", getStatusColor(entry.newStatusValue))}
                        >
                          {entry.newStatusLabel}
                        </Badge>
                      </div>

                      {/* Note */}
                      {entry.note && (
                        <div className="flex items-start gap-1.5 mt-1.5">
                          <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground italic">
                            {entry.note}
                          </p>
                        </div>
                      )}

                      {/* Timestamp */}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateShort(new Date(entry.changedAt), locale)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Load more pagination */}
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-xs"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    {t("jobs.statusHistoryLoading")}
                  </>
                ) : (
                  t("jobs.statusHistoryLoadMore")
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
