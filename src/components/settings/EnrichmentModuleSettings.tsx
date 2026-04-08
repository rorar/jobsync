"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Loader2, Database, HeartPulse } from "lucide-react";
import {
  getModuleManifests,
  activateModule,
  deactivateModule,
  runHealthCheck,
} from "@/actions/module.actions";
import type { ModuleManifestSummary } from "@/actions/module.actions";
import { ConnectorType } from "@/lib/connector/manifest";
import { useTranslations } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { toast } from "../ui/use-toast";

/** i18n description keys per enrichment module */
const DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  logo_dev: "enrichment.logoDevDescription",
  google_favicon: "enrichment.googleFaviconDescription",
  meta_parser: "enrichment.metaParserDescription",
};

/** i18n display-name keys per enrichment module */
const NAME_KEYS: Record<string, TranslationKey> = {
  logo_dev: "enrichment.logoDev",
  google_favicon: "enrichment.googleFavicon",
  meta_parser: "enrichment.metaParser",
};

/** i18n dimension label keys */
const DIMENSION_KEYS: Record<string, TranslationKey> = {
  logo: "enrichment.dimension.logo",
  deep_link: "enrichment.dimension.deep_link",
};

/** i18n health status keys */
const HEALTH_STATUS_KEYS: Record<string, TranslationKey> = {
  healthy: "enrichment.health.healthy",
  degraded: "enrichment.health.degraded",
  unreachable: "enrichment.health.unreachable",
  unknown: "enrichment.health.unknown",
};

function EnrichmentModuleSettings() {
  const { t } = useTranslations();
  const [modules, setModules] = useState<ModuleManifestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [moduleToDeactivate, setModuleToDeactivate] = useState<ModuleManifestSummary | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  useEffect(() => {
    const fetchModules = async () => {
      setIsLoading(true);
      try {
        const result = await getModuleManifests(
          ConnectorType.DATA_ENRICHMENT,
        );
        if (result.success && result.data) {
          setModules(result.data);
        }
      } catch (error) {
        console.error("Error fetching enrichment modules:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchModules();
  }, []);

  const handleToggleStatus = async (module: ModuleManifestSummary) => {
    // Show confirmation dialog for deactivation
    if (module.status === "active") {
      setModuleToDeactivate(module);
      return;
    }

    // Activate immediately (no confirmation needed)
    await doActivate(module);
  };

  const doDeactivate = async (module: ModuleManifestSummary) => {
    setToggling(module.moduleId);
    try {
      const result = await deactivateModule(module.moduleId);
      if (result.success && result.data) {
        setModules((prev) =>
          prev.map((m) =>
            m.moduleId === module.moduleId
              ? { ...m, status: "inactive" }
              : m,
          ),
        );
        const paused = result.data.pausedAutomations;
        toast({
          variant: "default",
          title: `${getModuleName(module)} — ${t("settings.moduleInactive")}`,
          description:
            paused > 0
              ? `${t("settings.moduleDeactivated")} ${t("settings.automationsPaused").replace("{count}", String(paused))}`
              : t("settings.moduleDeactivated"),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.error"),
          description: result.message || t("settings.unexpectedError"),
        });
      }
    } catch (error) {
      console.error("Error deactivating module:", error);
      toast({
        variant: "destructive",
        title: t("settings.error"),
        description: t("settings.unexpectedError"),
      });
    } finally {
      setToggling(null);
    }
  };

  const doActivate = async (module: ModuleManifestSummary) => {
    setToggling(module.moduleId);
    try {
      const result = await activateModule(module.moduleId);
      if (result.success) {
        setModules((prev) =>
          prev.map((m) =>
            m.moduleId === module.moduleId
              ? { ...m, status: "active" }
              : m,
          ),
        );
        toast({
          variant: "success",
          title: `${getModuleName(module)} — ${t("settings.moduleActive")}`,
          description: t("settings.moduleActivated"),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.error"),
          description: result.message || t("settings.unexpectedError"),
        });
      }
    } catch (error) {
      console.error("Error activating module:", error);
      toast({
        variant: "destructive",
        title: t("settings.error"),
        description: t("settings.unexpectedError"),
      });
    } finally {
      setToggling(null);
    }
  };

  const handleHealthCheck = async (module: ModuleManifestSummary) => {
    setChecking(module.moduleId);
    try {
      const result = await runHealthCheck(module.moduleId);
      if (result.success && result.data) {
        // Update local health status
        setModules((prev) =>
          prev.map((m) =>
            m.moduleId === module.moduleId
              ? { ...m, healthStatus: result.data!.healthStatus as ModuleManifestSummary["healthStatus"] }
              : m,
          ),
        );
        toast({
          variant: result.data.success ? "success" : "destructive",
          title: t("settings.healthCheckNow"),
          description: t("settings.healthCheckSuccess")
            .replace("{module}", getModuleName(module))
            .replace("{status}", t(HEALTH_STATUS_KEYS[result.data.healthStatus] ?? "enrichment.health.unknown"))
            .replace("{time}", String(result.data.responseTimeMs)),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.healthCheckNow"),
          description: t("settings.healthCheckFailed").replace("{module}", getModuleName(module)),
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.error"),
        description: t("settings.healthCheckFailed").replace("{module}", getModuleName(module)),
      });
    } finally {
      setChecking(null);
    }
  };

  /** Resolve display name via i18n, falling back to manifest name */
  function getModuleName(module: ModuleManifestSummary): string {
    const key = NAME_KEYS[module.moduleId];
    if (key) {
      const translated = t(key);
      if (translated !== key) return translated;
    }
    return module.name;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">
            {t("enrichment.modulesTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("enrichment.modulesDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          <span>{t("enrichment.loadingModules")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">
          {t("enrichment.modulesTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("enrichment.modulesDescription")}
        </p>
      </div>

      {modules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Database className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {t("enrichment.noModules")}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {t("enrichment.noModulesHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {modules.map((module) => {
            // Extract supported dimensions from the manifest
            // The manifest extension stores supportedDimensions, but the
            // serialized summary does not have it directly. We use the
            // moduleId to infer from known modules.
            const descKey =
              DESCRIPTION_KEYS[module.moduleId] ??
              ("enrichment.modulesDescription" as TranslationKey);

            return (
              <Card key={module.moduleId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {getModuleName(module)}
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {t(descKey)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${
                            module.healthStatus === "healthy"
                              ? "bg-green-500"
                              : module.healthStatus === "degraded"
                                ? "bg-yellow-500"
                                : module.healthStatus === "unreachable"
                                  ? "bg-red-500"
                                  : "bg-gray-400"
                          }`}
                          role="img"
                          aria-label={t(HEALTH_STATUS_KEYS[module.healthStatus] ?? "enrichment.health.unknown")}
                        >
                          <span className="sr-only">
                            {t(HEALTH_STATUS_KEYS[module.healthStatus] ?? "enrichment.health.unknown")}
                          </span>
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            module.status === "active"
                              ? "text-green-700 dark:text-green-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {module.status === "active"
                            ? t("settings.moduleActive")
                            : t("settings.moduleInactive")}
                        </span>
                        <Switch
                          checked={module.status === "active"}
                          disabled={toggling === module.moduleId}
                          onCheckedChange={() => handleToggleStatus(module)}
                          aria-label={t("enrichment.toggleModule").replace("{name}", getModuleName(module))}
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {t("enrichment.noCredentialRequired")}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={checking === module.moduleId || module.status !== "active"}
                      onClick={() => handleHealthCheck(module)}
                      aria-label={t("settings.healthCheckNow")}
                    >
                      {checking === module.moduleId ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <HeartPulse className="mr-1 h-3 w-3" />
                      )}
                      {checking === module.moduleId
                        ? t("settings.healthCheckRunning")
                        : t("settings.healthCheckNow")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Deactivation confirmation dialog */}
      <AlertDialog
        open={!!moduleToDeactivate}
        onOpenChange={(open) => !open && setModuleToDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("enrichment.deactivateConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("enrichment.deactivateConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (moduleToDeactivate) doDeactivate(moduleToDeactivate);
                setModuleToDeactivate(null);
              }}
            >
              {t("enrichment.deactivateConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default EnrichmentModuleSettings;
