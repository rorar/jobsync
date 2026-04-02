"use client";

import { useTranslations } from "@/i18n";
import { formatDateCompact } from "@/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Ban,
  Timer,
  History,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import type { AutomationRun, AutomationRunStatus } from "@/models/automation.model";

interface RunHistoryListProps {
  runs: AutomationRun[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

const STATUS_KEYS: Record<AutomationRunStatus, string> = {
  running: "automations.statusRunning",
  completed: "automations.statusCompleted",
  failed: "automations.statusFailed",
  completed_with_errors: "automations.statusCompletedWithErrors",
  blocked: "automations.statusBlocked",
  rate_limited: "automations.statusRateLimited",
};

const STATUS_CONFIG = {
  running: { icon: Clock, color: "text-blue-500", variant: "secondary" as const },
  completed: { icon: CheckCircle2, color: "text-green-500", variant: "default" as const },
  failed: { icon: XCircle, color: "text-red-500", variant: "destructive" as const },
  completed_with_errors: { icon: AlertCircle, color: "text-amber-500", variant: "secondary" as const },
  blocked: { icon: Ban, color: "text-red-500", variant: "destructive" as const },
  rate_limited: { icon: Timer, color: "text-amber-500", variant: "secondary" as const },
};

/** Map blockedReason values to i18n translation keys */
const BLOCKED_REASON_KEYS: Record<string, string> = {
  already_running: "automations.blockedAlreadyRunning",
  module_busy: "automations.blockedModuleBusy",
  module_deactivated: "automations.blockedModuleDeactivated",
  auth_failure: "automations.blockedAuthFailure",
  consecutive_failures: "automations.blockedConsecutiveFailures",
  circuit_breaker: "automations.blockedCircuitBreaker",
  resume_missing: "automations.blockedResumeMissing",
};

/** Format a duration in seconds to a human-readable string with hours support */
function formatDuration(seconds: number, t: (key: string) => string): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return t("automations.elapsedHourMinSec")
      .replace("{hour}", String(h))
      .replace("{min}", String(m))
      .replace("{sec}", String(s));
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return t("automations.elapsedMinSec")
      .replace("{min}", String(m))
      .replace("{sec}", String(s));
  }
  return t("automations.elapsedSec").replace("{sec}", String(seconds));
}

export function RunHistoryList({ runs, loading = false, error = false, onRetry }: RunHistoryListProps) {
  const { t, locale } = useTranslations();

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("automations.runHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8">
            <AlertCircle className="h-10 w-10 text-destructive mb-3" aria-hidden="true" />
            <p className="text-destructive text-sm">{t("automations.runHistoryError")}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry} className="mt-3 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {t("automations.runHistoryRetry")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading && runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("automations.runHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse motion-reduce:animate-none rounded bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <History aria-hidden="true" className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("automations.noRuns")}</h3>
          <p className="text-muted-foreground text-center mt-2">
            {t("automations.noRunsDesc")}
          </p>
        </CardContent>
      </Card>
    );
  }

  /** Translate a blockedReason if known, otherwise return the raw string */
  const translateBlockedReason = (reason: string): string => {
    const key = BLOCKED_REASON_KEYS[reason];
    return key ? t(key) : reason;
  };

  /** Get display text for error/blocked column */
  const getErrorDisplay = (run: AutomationRun): string => {
    if (run.blockedReason) return translateBlockedReason(run.blockedReason);
    return run.errorMessage ?? "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("automations.runHistory")}</CardTitle>
        <CardDescription>
          {t("automations.runHistoryDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto" role="region" aria-label={t("automations.runHistory")} tabIndex={0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("automations.statusHeader")}</TableHead>
              <TableHead>{t("automations.sourceHeader")}</TableHead>
              <TableHead>{t("automations.startedHeader")}</TableHead>
              <TableHead>{t("automations.duration")}</TableHead>
              <TableHead className="hidden md:table-cell text-center">{t("automations.searched")}</TableHead>
              <TableHead className="hidden md:table-cell text-center">{t("automations.new")}</TableHead>
              <TableHead className="hidden md:table-cell text-center">{t("automations.processed")}</TableHead>
              <TableHead className="hidden md:table-cell text-center">{t("automations.matched")}</TableHead>
              <TableHead className="text-center">{t("automations.saved")}</TableHead>
              <TableHead>{t("automations.errorHeader")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => {
              const config = STATUS_CONFIG[run.status] || STATUS_CONFIG.failed;
              const StatusIcon = config.icon;
              const duration = run.completedAt
                ? Math.round(
                    (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
                  )
                : null;

              return (
                <TableRow key={run.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusIcon aria-hidden="true" className={`h-4 w-4 ${config.color}`} />
                      <Badge variant={config.variant}>{t(STATUS_KEYS[run.status] ?? run.status)}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {run.runSource === "manual" ? (
                        <>
                          <PlayCircle aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {t("automations.runSourceManual")}
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {t("automations.runSourceScheduler")}
                          </span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDateCompact(new Date(run.startedAt), locale)}
                  </TableCell>
                  <TableCell>
                    {duration !== null ? formatDuration(duration, t) : "-"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-center">{run.jobsSearched}</TableCell>
                  <TableCell className="hidden md:table-cell text-center">{run.jobsDeduplicated}</TableCell>
                  <TableCell className="hidden md:table-cell text-center">{run.jobsProcessed}</TableCell>
                  <TableCell className="hidden md:table-cell text-center">{run.jobsMatched}</TableCell>
                  <TableCell className="text-center">
                    <span className="font-medium">{run.jobsSaved}</span>
                  </TableCell>
                  <TableCell>
                    {(run.errorMessage || run.blockedReason) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex" tabIndex={0}>
                              <Badge variant="outline" className="max-w-[150px] truncate">
                                {getErrorDisplay(run)}
                              </Badge>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              {getErrorDisplay(run)}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
