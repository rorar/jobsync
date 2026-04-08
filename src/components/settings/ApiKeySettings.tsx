"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Label } from "../ui/label";
import { toast } from "../ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Switch } from "../ui/switch";
import { Loader2, Plus, Trash2, CheckCircle, HeartPulse } from "lucide-react";
import {
  getUserApiKeys,
  saveApiKey,
  deleteApiKey,
  getDefaultOllamaBaseUrl,
} from "@/actions/apiKey.actions";
import {
  getCredentialModules,
  activateModule,
  deactivateModule,
  runHealthCheck,
} from "@/actions/module.actions";
import type { ModuleManifestSummary } from "@/actions/module.actions";
import type {
  ApiKeyClientResponse,
  ApiKeyModuleId,
} from "@/models/apiKey.model";
import { useTranslations, formatDateCompact } from "@/i18n";
import type { TranslationKey } from "@/i18n";

interface ModuleConfig {
  id: ApiKeyModuleId;
  moduleId: string;
  name: string;
  i18n?: Record<string, { name: string; description: string }>;
  placeholder: string;
  inputType: "password" | "text";
  descriptionKey: TranslationKey;
  sensitive: boolean;
  status: "active" | "inactive" | "error";
  healthStatus: "healthy" | "degraded" | "unreachable" | "unknown";
  lastSuccessfulConnection?: string;
}

/** Fallback description keys per module — i18n keys defined in settings dictionary */
const DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  openai: "settings.openaiDesc",
  deepseek: "settings.deepseekDesc",
  rapidapi: "settings.rapidapiDesc",
  ollama: "settings.ollamaDesc",
};

function manifestToModuleConfig(m: ModuleManifestSummary): ModuleConfig {
  return {
    id: m.credential.moduleId as ApiKeyModuleId,
    moduleId: m.moduleId,
    name: m.name,
    i18n: m.i18n,
    placeholder: m.credential.placeholder ?? "",
    inputType: m.credential.sensitive ? "password" : "text",
    descriptionKey: DESCRIPTION_KEYS[m.credential.moduleId] ?? ("settings.apiKeysDesc" as TranslationKey),
    sensitive: m.credential.sensitive,
    status: m.status as "active" | "inactive" | "error",
    healthStatus: m.healthStatus as ModuleConfig["healthStatus"],
    lastSuccessfulConnection: m.lastSuccessfulConnection,
  };
}

/** Resolve display name from manifest i18n, falling back to manifest.name */
function getModuleName(module: ModuleConfig, locale: string): string {
  return module.i18n?.[locale]?.name
    ?? module.i18n?.["en"]?.name
    ?? module.name;
}

const DEFAULT_OLLAMA_PLACEHOLDER = "http://127.0.0.1:11434";

function ApiKeySettings() {
  const { t, locale } = useTranslations();
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [keys, setKeys] = useState<ApiKeyClientResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultOllamaUrl, setDefaultOllamaUrl] = useState(
    DEFAULT_OLLAMA_PLACEHOLDER,
  );
  const [editingModule, setEditingModule] = useState<ApiKeyModuleId | null>(
    null,
  );
  const [inputValue, setInputValue] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const addButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    fetchKeys();
    getDefaultOllamaBaseUrl().then(setDefaultOllamaUrl);
    // Load module manifests from registry
    getCredentialModules().then((result) => {
      if (result.success && result.data) {
        setModules(result.data.map(manifestToModuleConfig));
      }
    });
  }, []);

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
      const result = await getUserApiKeys();
      if (result.success && result.data) {
        setKeys(result.data as any);
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getKeyForModule = (moduleId: ApiKeyModuleId) =>
    keys.find((k) => k.moduleId === moduleId);

  const handleVerifyAndSave = async (moduleId: ApiKeyModuleId) => {
    if (!inputValue.trim()) return;

    setVerifying(true);
    try {
      const verifyRes = await fetch("/api/settings/api-keys/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, key: inputValue }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        toast({
          variant: "destructive",
          title: t("settings.verificationFailed"),
          description: verifyData.error || t("settings.couldNotVerifyKey"),
        });
        return;
      }

      const moduleConfig = modules.find((m) => m.id === moduleId);
      const saveResult = await saveApiKey({
        moduleId,
        key: inputValue,
        sensitive: moduleConfig?.sensitive ?? true,
      });
      if (saveResult.success) {
        toast({
          variant: "success",
          title: t("settings.apiKeySaved"),
          description: t("settings.keyVerifiedAndSaved").replace("{module}", (() => { const m = modules.find((mod) => mod.id === moduleId); return m ? getModuleName(m, locale) : moduleId; })()),
        });
        setEditingModule(null);
        setInputValue("");
        await fetchKeys();
      } else {
        toast({
          variant: "destructive",
          title: t("settings.saveFailed"),
          description: saveResult.message || t("settings.failedToSaveApiKey"),
        });
      }
    } catch (error) {
      console.error("Error saving API key:", error);
      toast({
        variant: "destructive",
        title: t("settings.error"),
        description: t("settings.unexpectedError"),
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleDelete = async (moduleId: ApiKeyModuleId) => {
    setDeleting(moduleId);
    try {
      const result = await deleteApiKey(moduleId);
      if (result.success) {
        toast({
          variant: "success",
          title: t("settings.apiKeyDeleted"),
          description: t("settings.keyRemoved").replace("{module}", (() => { const m = modules.find((mod) => mod.id === moduleId); return m ? getModuleName(m, locale) : moduleId; })()),
        });
        await fetchKeys();
      } else {
        toast({
          variant: "destructive",
          title: t("settings.error"),
          description: result.message || t("settings.failedToDeleteApiKey"),
        });
      }
    } catch (error) {
      console.error("Error deleting API key:", error);
    } finally {
      setDeleting(null);
    }
  };

  const handleCancel = () => {
    const moduleId = editingModule;
    setEditingModule(null);
    setInputValue("");
    // Restore focus to the Add/Update button for the module that was being edited
    if (moduleId) {
      requestAnimationFrame(() => {
        addButtonRefs.current.get(moduleId)?.focus();
      });
    }
  };

  const handleToggleStatus = async (module: ModuleConfig) => {
    setToggling(module.moduleId);
    try {
      if (module.status === "active") {
        const result = await deactivateModule(module.moduleId);
        if (result.success && result.data) {
          setModules((prev) =>
            prev.map((m) =>
              m.moduleId === module.moduleId ? { ...m, status: "inactive" as const } : m,
            ),
          );
          const paused = result.data.pausedAutomations;
          toast({
            variant: "default",
            title: `${getModuleName(module, locale)} — ${t("settings.moduleInactive")}`,
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
      } else {
        const result = await activateModule(module.moduleId);
        if (result.success) {
          setModules((prev) =>
            prev.map((m) =>
              m.moduleId === module.moduleId ? { ...m, status: "active" as const } : m,
            ),
          );
          toast({
            variant: "success",
            title: `${getModuleName(module, locale)} — ${t("settings.moduleActive")}`,
            description: t("settings.moduleActivated"),
          });
        } else {
          toast({
            variant: "destructive",
            title: t("settings.error"),
            description: result.message || t("settings.unexpectedError"),
          });
        }
      }
    } catch (error) {
      console.error("Error toggling module status:", error);
      toast({
        variant: "destructive",
        title: t("settings.error"),
        description: t("settings.unexpectedError"),
      });
    } finally {
      setToggling(null);
    }
  };

  /** i18n health status keys — same pattern as EnrichmentModuleSettings */
  const HEALTH_STATUS_KEYS: Record<string, TranslationKey> = {
    healthy: "enrichment.health.healthy",
    degraded: "enrichment.health.degraded",
    unreachable: "enrichment.health.unreachable",
    unknown: "enrichment.health.unknown",
  };

  const handleHealthCheck = async (module: ModuleConfig) => {
    setChecking(module.moduleId);
    try {
      const result = await runHealthCheck(module.moduleId);
      if (result.success && result.data) {
        setModules((prev) =>
          prev.map((m) =>
            m.moduleId === module.moduleId
              ? { ...m, healthStatus: result.data!.healthStatus as ModuleConfig["healthStatus"] }
              : m,
          ),
        );
        toast({
          variant: result.data.success ? "success" : "destructive",
          title: t("settings.healthCheckNow"),
          description: t("settings.healthCheckSuccess")
            .replace("{module}", getModuleName(module, locale))
            .replace("{status}", t(HEALTH_STATUS_KEYS[result.data.healthStatus] ?? "enrichment.health.unknown"))
            .replace("{time}", String(result.data.responseTimeMs)),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.healthCheckNow"),
          description: t("settings.healthCheckFailed").replace("{module}", getModuleName(module, locale)),
        });
      }
    } catch (error) {
      console.error(`[ApiKeySettings] Health check failed for "${module.moduleId}":`, error);
      toast({
        variant: "destructive",
        title: t("settings.error"),
        description: t("settings.healthCheckFailed").replace("{module}", getModuleName(module, locale)),
      });
    } finally {
      setChecking(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("settings.apiKeys")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.apiKeysDesc")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          <span>{t("settings.loadingKeys")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{t("settings.apiKeys")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.apiKeysDesc")}{" "}
          {t("settings.apiKeysDescSecure")}
        </p>
      </div>

      <div className="grid gap-4">
        {modules.map((module) => {
          const existingKey = getKeyForModule(module.id);
          const isEditing = editingModule === module.id;

          return (
            <Card key={module.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{getModuleName(module, locale)}</CardTitle>
                    <CardDescription className="text-sm">
                      {t(module.descriptionKey)}
                      {module.id === "ollama" && (
                        <span className="block text-xs text-muted-foreground/70 mt-0.5">
                          Default: {defaultOllamaUrl}
                        </span>
                      )}
                      {module.lastSuccessfulConnection && (
                        <span className="block text-xs text-muted-foreground/70 mt-0.5">
                          {t("settings.lastConnected")}: {formatDateCompact(new Date(module.lastSuccessfulConnection), locale)}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2" aria-live="polite">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          module.healthStatus === "healthy" ? "bg-green-500" :
                          module.healthStatus === "degraded" ? "bg-yellow-500" :
                          module.healthStatus === "unreachable" ? "bg-red-500" :
                          "bg-gray-400"
                        }`}
                        aria-hidden="true"
                      />
                      <span className={`text-xs font-medium ${module.status === "active" ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                        {module.status === "active" ? t("settings.moduleActive") : t("settings.moduleInactive")}
                      </span>
                      <Switch
                        checked={module.status === "active"}
                        disabled={toggling === module.moduleId}
                        onCheckedChange={() => handleToggleStatus(module)}
                        aria-label={`Toggle ${getModuleName(module, locale)} module`}
                      />
                    </div>
                    {existingKey ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {module.sensitive
                          ? `····${existingKey.last4}`
                          : existingKey.displayValue || existingKey.last4}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t("settings.notConfigured")}</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor={`key-${module.id}`}>
                        {module.id === "ollama" ? t("settings.baseUrl") : t("settings.apiKey")}
                      </Label>
                      <Input
                        id={`key-${module.id}`}
                        type={module.inputType}
                        placeholder={
                          module.id === "ollama"
                            ? defaultOllamaUrl
                            : module.placeholder
                        }
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleVerifyAndSave(module.id)}
                        disabled={!inputValue.trim() || verifying}
                      >
                        {verifying && (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin motion-reduce:animate-none" />
                        )}
                        {t("settings.verifySave")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancel}
                      >
                        {t("settings.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      ref={(el) => {
                        if (el) addButtonRefs.current.set(module.id, el);
                        else addButtonRefs.current.delete(module.id);
                      }}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingModule(module.id);
                        setInputValue("");
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {existingKey ? t("settings.updateKey") : t("settings.addKey")}
                    </Button>
                    {existingKey && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={deleting === module.id}
                          >
                            {deleting === module.id ? (
                              <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("settings.deleteApiKey")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("settings.deleteApiKeyDesc")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("settings.cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(module.id)}
                            >
                              {t("settings.delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
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
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default ApiKeySettings;
