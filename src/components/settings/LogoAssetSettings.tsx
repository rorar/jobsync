"use client";

import { useEffect, useState } from "react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { toast } from "../ui/use-toast";
import { Check, Loader2 } from "lucide-react";
import { getUserSettings, updateUserSettings } from "@/actions/userSettings.actions";
import { useTranslations } from "@/i18n";
import type { LogoAssetConfig } from "@/models/userSettings.model";
import { defaultLogoAssetConfig } from "@/models/userSettings.model";

function LogoAssetSettings() {
  const { t } = useTranslations();
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<LogoAssetConfig>(defaultLogoAssetConfig);
  const [maxFileSizeInput, setMaxFileSizeInput] = useState(
    String(defaultLogoAssetConfig.maxFileSize / 1024),
  );
  const [maxDimensionInput, setMaxDimensionInput] = useState(
    String(defaultLogoAssetConfig.maxDimension),
  );

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const result = await getUserSettings();
        if (result.success && result.data?.settings?.logoAsset) {
          const logoAsset = result.data.settings.logoAsset;
          const merged = { ...defaultLogoAssetConfig, ...logoAsset };
          setSettings(merged);
          setMaxFileSizeInput(String(Math.round(merged.maxFileSize / 1024)));
          setMaxDimensionInput(String(merged.maxDimension));
        }
      } catch (error) {
        console.error("Error fetching logo asset settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (update: Partial<LogoAssetConfig>) => {
    const newSettings: LogoAssetConfig = {
      ...settings,
      ...update,
    };
    setSettings(newSettings);

    try {
      const result = await updateUserSettings({ logoAsset: newSettings });
      if (result.success) {
        toast({
          variant: "success",
          title: t("settings.saved"),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.error"),
          description: t("settings.saveFailed"),
        });
        setSettings(settings);
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.error"),
        description: t("settings.saveFailed"),
      });
      setSettings(settings);
    }
  };

  const handleMaxFileSizeSave = () => {
    const valueKB = parseInt(maxFileSizeInput, 10);
    if (isNaN(valueKB) || valueKB < 64 || valueKB > 2048) {
      setMaxFileSizeInput(String(Math.round(settings.maxFileSize / 1024)));
      return;
    }
    handleSave({ maxFileSize: valueKB * 1024 });
  };

  const handleMaxDimensionSave = () => {
    const value = parseInt(maxDimensionInput, 10);
    if (isNaN(value) || value < 64 || value > 1024) {
      setMaxDimensionInput(String(settings.maxDimension));
      return;
    }
    handleSave({ maxDimension: value });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("logoAsset.settingsTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("logoAsset.settingsDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          <span>{t("settings.loadingSettings")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{t("logoAsset.settingsTitle")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("logoAsset.settingsDescription")}
        </p>
      </div>

      <div className="space-y-4">
        {/* Max file size */}
        <div className="rounded-lg border p-4 space-y-2">
          <div className="space-y-0.5">
            <Label htmlFor="logo-max-file-size">
              {t("logoAsset.maxFileSize")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("logoAsset.maxFileSizeDesc")}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Input
              id="logo-max-file-size"
              type="number"
              min={64}
              max={2048}
              className="w-24"
              value={maxFileSizeInput}
              onChange={(e) => setMaxFileSizeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleMaxFileSizeSave();
                }
              }}
            />
            <span className="text-sm text-muted-foreground">KB</span>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={handleMaxFileSizeSave}
              aria-label={t("common.save")}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Max dimension */}
        <div className="rounded-lg border p-4 space-y-2">
          <div className="space-y-0.5">
            <Label htmlFor="logo-max-dimension">
              {t("logoAsset.maxDimension")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("logoAsset.maxDimensionDesc")}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Input
              id="logo-max-dimension"
              type="number"
              min={64}
              max={1024}
              className="w-24"
              value={maxDimensionInput}
              onChange={(e) => setMaxDimensionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleMaxDimensionSave();
                }
              }}
            />
            <span className="text-sm text-muted-foreground">px</span>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={handleMaxDimensionSave}
              aria-label={t("common.save")}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LogoAssetSettings;
