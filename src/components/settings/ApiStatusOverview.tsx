"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Loader2, HeartPulse, Activity } from "lucide-react";
import {
  getModuleManifests,
  runHealthCheck,
} from "@/actions/module.actions";
import type { ModuleManifestSummary } from "@/actions/module.actions";
import { CredentialType } from "@/lib/connector/manifest";
import { useTranslations } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { toast } from "../ui/use-toast";
import { getModuleName } from "@/lib/connector/i18n-utils";

/** Connector group display order */
const CONNECTOR_GROUPS = ["job_discovery", "ai_provider", "data_enrichment", "reference_data"] as const;

/** i18n keys for connector group names */
const GROUP_LABEL_KEYS: Record<string, TranslationKey> = {
  job_discovery: "enrichment.connectorGroup.job_discovery",
  ai_provider: "enrichment.connectorGroup.ai_provider",
  data_enrichment: "enrichment.connectorGroup.data_enrichment",
  reference_data: "enrichment.connectorGroup.reference_data",
};

/** i18n keys for health status labels */
const HEALTH_STATUS_KEYS: Record<string, TranslationKey> = {
  healthy: "enrichment.health.healthy",
  degraded: "enrichment.health.degraded",
  unreachable: "enrichment.health.unreachable",
  unknown: "enrichment.health.unknown",
};

/** Health status sort priority (problems first) */
const HEALTH_SORT_ORDER: Record<string, number> = {
  unreachable: 0,
  degraded: 1,
  unknown: 2,
  healthy: 3,
};

/** Health dot color classes */
function healthDotClass(status: string): string {
  switch (status) {
    case "healthy": return "bg-green-500";
    case "degraded": return "bg-yellow-500";
    case "unreachable": return "bg-red-500";
    default: return "bg-gray-400";
  }
}

/** Format a relative time string from an ISO timestamp */
function relativeTime(isoString: string | undefined): string | null {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ApiStatusOverview() {
  const { t, locale } = useTranslations();
  const [modules, setModules] = useState<ModuleManifestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [isCheckingAll, setIsCheckingAll] = useState(false);

  const fetchModules = useCallback(async () => {
    try {
      setFetchError(false);
      const result = await getModuleManifests();
      if (result.success && result.data) {
        setModules(result.data);
      } else {
        setFetchError(true);
      }
    } catch (error) {
      console.error("Error fetching modules:", error);
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchModules().finally(() => setIsLoading(false));
  }, [fetchModules]);

  // Periodic refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchModules, 60000);
    return () => clearInterval(interval);
  }, [fetchModules]);

  /** Run a single health check. silent=true suppresses error toasts (used in batch). */
  const handleHealthCheck = async (moduleId: string, silent = false) => {
    setChecking((prev) => new Set(prev).add(moduleId));
    try {
      const result = await runHealthCheck(moduleId);
      if (result.success && result.data) {
        setModules((prev) =>
          prev.map((m) =>
            m.moduleId === moduleId
              ? {
                  ...m,
                  healthStatus: result.data!.healthStatus,
                  lastHealthCheck: new Date().toISOString(),
                }
              : m,
          ),
        );
      } else if (!silent) {
        toast({
          variant: "destructive",
          title: t("settings.healthCheckNow"),
          description: result.message ?? t("settings.unexpectedError"),
        });
      }
      return result;
    } catch (error) {
      console.error(`[ApiStatusOverview] Health check failed for "${moduleId}":`, error);
      if (!silent) {
        toast({
          variant: "destructive",
          title: t("settings.healthCheckNow"),
          description: t("settings.unexpectedError"),
        });
      }
      return null;
    } finally {
      setChecking((prev) => {
        const next = new Set(prev);
        next.delete(moduleId);
        return next;
      });
    }
  };

  /** Check all active modules sequentially to respect server rate limits. */
  const handleCheckAll = async () => {
    const activeModules = modules.filter((m) => m.status === "active");
    if (activeModules.length === 0) return;

    setIsCheckingAll(true);
    setChecking(new Set(activeModules.map((m) => m.moduleId)));

    let healthy = 0, degraded = 0, unreachable = 0;

    for (const m of activeModules) {
      const result = await handleHealthCheck(m.moduleId, true);
      if (result?.success && result.data) {
        const hs = result.data.healthStatus;
        if (hs === "healthy") healthy++;
        else if (hs === "degraded") degraded++;
        else if (hs === "unreachable") unreachable++;
      }
    }

    toast({
      variant: unreachable > 0 ? "destructive" : "default",
      title: t("enrichment.healthOverviewTitle"),
      description: `${healthy} ${t("enrichment.health.healthy").toLowerCase()}, ${degraded} ${t("enrichment.health.degraded").toLowerCase()}, ${unreachable} ${t("enrichment.health.unreachable").toLowerCase()}`,
    });

    setIsCheckingAll(false);
    setChecking(new Set());
  };

  /** Group modules by connector type, sorted by health status */
  function getGroupedModules(): Map<string, ModuleManifestSummary[]> {
    const grouped = new Map<string, ModuleManifestSummary[]>();
    for (const group of CONNECTOR_GROUPS) {
      const groupModules = modules
        .filter((m) => m.connectorType === group)
        .sort((a, b) => {
          const orderA = HEALTH_SORT_ORDER[a.healthStatus] ?? 2;
          const orderB = HEALTH_SORT_ORDER[b.healthStatus] ?? 2;
          if (orderA !== orderB) return orderA - orderB;
          return a.name.localeCompare(b.name);
        });
      if (groupModules.length > 0) {
        grouped.set(group, groupModules);
      }
    }
    return grouped;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">
            {t("enrichment.healthOverviewTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("enrichment.healthOverviewDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          <span>{t("enrichment.loadingModules")}</span>
        </div>
      </div>
    );
  }

  const grouped = getGroupedModules();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-lg font-medium">
            {t("enrichment.healthOverviewTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("enrichment.healthOverviewDescription")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isCheckingAll || fetchError}
          onClick={handleCheckAll}
        >
          {isCheckingAll ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Activity className="mr-1.5 h-3.5 w-3.5" />
          )}
          {isCheckingAll
            ? t("enrichment.checkingAll")
            : t("enrichment.checkAll")}
        </Button>
      </div>

      {/* Error state */}
      {fetchError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Activity className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">{t("enrichment.errorLoading")}</p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!fetchError && grouped.size === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{t("enrichment.noModules")}</p>
          </CardContent>
        </Card>
      )}

      {/* Connector Groups */}
      {CONNECTOR_GROUPS.map((group) => {
        const groupModules = grouped.get(group);
        if (!groupModules || groupModules.length === 0) return null;

        return (
          <Card key={group}>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">
                  {t(GROUP_LABEL_KEYS[group]!)}
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {groupModules.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              <div className="divide-y">
                {groupModules.map((module) => (
                  <ModuleStatusRow
                    key={module.moduleId}
                    module={module}
                    moduleName={getModuleName(module, locale)}
                    isChecking={checking.has(module.moduleId)}
                    onCheck={() => handleHealthCheck(module.moduleId)}
                    t={t}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Single module status row */
function ModuleStatusRow({
  module,
  moduleName,
  isChecking,
  onCheck,
  t,
}: {
  module: ModuleManifestSummary;
  moduleName: string;
  isChecking: boolean;
  onCheck: () => void;
  t: (key: TranslationKey) => string;
}) {
  const isKeyless = module.credential.type === CredentialType.NONE;
  const healthLabel = t(HEALTH_STATUS_KEYS[module.healthStatus] ?? "enrichment.health.unknown");
  const lastCheckedRel = relativeTime(module.lastHealthCheck);
  const isInactive = module.status !== "active";

  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Left: dot + name + badges */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${healthDotClass(module.healthStatus)}`}
          role="img"
          aria-label={healthLabel}
        />
        <span className={`text-sm font-medium truncate ${isInactive ? "text-muted-foreground" : ""}`}>
          {moduleName}
        </span>
        {isKeyless && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 shrink-0 hidden sm:inline-flex">
            {t("enrichment.noCredentialRequired")}
          </Badge>
        )}
        {isInactive && (
          <Badge variant="secondary" className="text-xs px-2 py-0.5 shrink-0">
            {t("settings.moduleInactive")}
          </Badge>
        )}
      </div>

      {/* Right: status + time + check button */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground">
          {healthLabel}
        </span>
        {lastCheckedRel && (
          <time
            className="text-xs text-muted-foreground hidden md:inline"
            dateTime={module.lastHealthCheck}
            title={module.lastHealthCheck}
          >
            {lastCheckedRel}
          </time>
        )}
        {/*
          M-Y-04 (Sprint 3 Stream F): the health-check button was h-8 w-8
          (32x32), failing both WCAG 2.5.5 AAA (44x44) and 2.5.8 AA (24x24
          passed but close to the minimum). Upgraded to `size="icon-lg"`
          which resolves to 44x44 via buttonVariants. The row is tall
          enough (py-2.5 + text content) to absorb the larger button
          without reflow; verified against the grouped card layout.
        */}
        <Button
          size="icon-lg"
          variant="ghost"
          disabled={isChecking || isInactive}
          onClick={onCheck}
          aria-label={`${t("settings.healthCheckNow")} — ${moduleName}`}
        >
          {isChecking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <HeartPulse className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default ApiStatusOverview;
