"use client";

import { useEffect, useState } from "react";
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
import { Loader2, Plus, Trash2, CheckCircle } from "lucide-react";
import {
  getUserApiKeys,
  saveApiKey,
  deleteApiKey,
  getDefaultOllamaBaseUrl,
} from "@/actions/apiKey.actions";
import { getCredentialModules } from "@/actions/module.actions";
import type { ModuleManifestSummary } from "@/actions/module.actions";
import type {
  ApiKeyClientResponse,
  ApiKeyModuleId,
} from "@/models/apiKey.model";
import { useTranslations } from "@/i18n";
import type { TranslationKey } from "@/i18n";

interface ModuleConfig {
  id: ApiKeyModuleId;
  name: string;
  placeholder: string;
  inputType: "password" | "text";
  descriptionKey: TranslationKey;
  sensitive: boolean;
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
    name: m.name,
    placeholder: m.credential.placeholder ?? "",
    inputType: m.credential.sensitive ? "password" : "text",
    descriptionKey: DESCRIPTION_KEYS[m.credential.moduleId] ?? ("settings.apiKeysDesc" as TranslationKey),
    sensitive: m.credential.sensitive,
  };
}

const DEFAULT_OLLAMA_PLACEHOLDER = "http://127.0.0.1:11434";

function ApiKeySettings() {
  const { t } = useTranslations();
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
          description: t("settings.keyVerifiedAndSaved").replace("{module}", modules.find((m) => m.id === moduleId)?.name ?? moduleId),
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
          description: t("settings.keyRemoved").replace("{module}", modules.find((m) => m.id === moduleId)?.name ?? moduleId),
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
    setEditingModule(null);
    setInputValue("");
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
          <Loader2 className="h-4 w-4 animate-spin" />
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
                    <CardTitle className="text-base">{module.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {t(module.descriptionKey)}
                      {module.id === "ollama" && (
                        <span className="block text-xs text-muted-foreground/70 mt-0.5">
                          Default: {defaultOllamaUrl}
                        </span>
                      )}
                    </CardDescription>
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
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
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
                              <Loader2 className="h-3 w-3 animate-spin" />
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
