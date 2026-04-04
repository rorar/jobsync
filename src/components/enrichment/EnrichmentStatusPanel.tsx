"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, formatDateShort } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyLogo } from "@/components/ui/company-logo";
import { toast } from "@/components/ui/use-toast";
import {
  getEnrichmentStatus,
  triggerEnrichment,
  refreshEnrichment,
} from "@/actions/enrichment.actions";
import type { EnrichmentResult } from "@/lib/connector/data-enrichment/types";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Database,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EnrichmentStatusPanelProps {
  companyId: string;
  companyName: string;
  logoUrl?: string | null;
}

/** Map dimension string to i18n key */
function getDimensionLabel(dimension: string): string {
  switch (dimension) {
    case "logo":
      return "enrichment.dimensionLogo";
    case "deep_link":
      return "enrichment.dimensionDeepLink";
    default:
      return dimension;
  }
}

/** Map enrichment status to visual badge variant */
function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "found":
      return "default";
    case "not_found":
      return "secondary";
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

/** Map enrichment status to i18n key */
function getStatusLabel(status: string): string {
  switch (status) {
    case "found":
      return "enrichment.completed";
    case "not_found":
      return "enrichment.pending";
    case "error":
      return "enrichment.failed";
    default:
      return status;
  }
}

/** Map enrichment status to icon */
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "found":
      return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "not_found":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "error":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Database className="h-4 w-4 text-muted-foreground" />;
  }
}

function EnrichmentStatusSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-md border">
          <div className="h-4 w-4 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-muted rounded animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-32 bg-muted rounded animate-pulse motion-reduce:animate-none" />
          </div>
          <div className="h-5 w-16 bg-muted rounded animate-pulse motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

export function EnrichmentStatusPanel({
  companyId,
  companyName,
  logoUrl,
}: EnrichmentStatusPanelProps) {
  const { t, locale } = useTranslations();
  const [results, setResults] = useState<EnrichmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await getEnrichmentStatus(companyId);
      if (response.success && response.data) {
        setResults(response.data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleRefresh = useCallback(
    async (resultId: string) => {
      setRefreshingId(resultId);
      try {
        const response = await refreshEnrichment(resultId);
        if (response.success) {
          toast({
            title: t("enrichment.refreshSuccess"),
          });
          await fetchStatus();
        } else {
          toast({
            title: t(response.message ?? "enrichment.refreshFailed"),
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: t("enrichment.refreshFailed"),
          variant: "destructive",
        });
      } finally {
        setRefreshingId(null);
      }
    },
    [fetchStatus, t],
  );

  const handleTrigger = useCallback(
    async (dimension: "logo" | "deep_link") => {
      setTriggering(true);
      try {
        const response = await triggerEnrichment(companyId, dimension);
        if (response.success) {
          toast({
            title: t("enrichment.triggerSuccess"),
          });
          await fetchStatus();
        } else {
          toast({
            title: t(response.message ?? "enrichment.triggerFailed"),
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: t("enrichment.triggerFailed"),
          variant: "destructive",
        });
      } finally {
        setTriggering(false);
      }
    },
    [companyId, fetchStatus, t],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CompanyLogo
            logoUrl={logoUrl}
            companyName={companyName}
            size="sm"
          />
          <CardTitle className="text-base">{t("enrichment.statusPanel")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Loading state */}
        {loading && <EnrichmentStatusSkeleton />}

        {/* Error state */}
        {!loading && error && (
          <div
            className="flex flex-col items-center gap-3 py-4 text-center"
            role="alert"
          >
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">
              {t("enrichment.errorLoading")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              aria-label={t("enrichment.retryButton")}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {t("enrichment.retryButton")}
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && results.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Database className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">
                {t("enrichment.noData")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("enrichment.noDataHint")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTrigger("logo")}
              disabled={triggering}
              aria-label={t("enrichment.triggerEnrichment")}
            >
              {triggering ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Database className="h-3.5 w-3.5 mr-1.5" />
              )}
              {triggering
                ? t("enrichment.enriching")
                : t("enrichment.triggerEnrichment")}
            </Button>
          </div>
        )}

        {/* Results list */}
        {!loading && !error && results.length > 0 && (
          <div className="space-y-2">
            {results.map((result) => (
              <div
                key={result.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-md border transition-colors",
                  "hover:bg-accent/50",
                )}
              >
                <StatusIcon status={result.status} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {t(getDimensionLabel(result.dimension))}
                    </span>
                    <Badge variant={getStatusVariant(result.status)} className="text-xs">
                      {t(getStatusLabel(result.status))}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>
                      {t("enrichment.source")}: {result.sourceModuleId}
                    </span>
                    <span className="hidden sm:inline" aria-hidden="true">
                      &middot;
                    </span>
                    <span className="hidden sm:inline">
                      {t("enrichment.lastUpdated")}:{" "}
                      {formatDateShort(new Date(result.updatedAt), locale)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRefresh(result.id)}
                  disabled={refreshingId === result.id}
                  aria-label={t("enrichment.refreshButton")}
                  className="shrink-0"
                >
                  {refreshingId === result.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span className="sr-only sm:not-sr-only sm:ml-1.5">
                    {refreshingId === result.id
                      ? t("enrichment.refreshing")
                      : t("enrichment.refreshButton")}
                  </span>
                </Button>
              </div>
            ))}

            {/* Trigger enrichment for missing dimensions */}
            <div className="pt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTrigger("logo")}
                disabled={triggering}
                aria-label={t("enrichment.triggerEnrichment")}
              >
                {triggering ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Database className="h-3.5 w-3.5 mr-1.5" />
                )}
                {triggering
                  ? t("enrichment.enriching")
                  : t("enrichment.triggerEnrichment")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
