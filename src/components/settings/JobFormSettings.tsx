"use client";

import { useEffect, useState } from "react";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { toast } from "../ui/use-toast";
import { Loader2 } from "lucide-react";
import { getUserSettings, updateJobFormSettings } from "@/actions/userSettings.actions";
import { useTranslations } from "@/i18n";
import {
  type JobFormSettings as JobFormSettingsType,
  defaultJobFormSettings,
} from "@/models/userSettings.model";

function JobFormSettings() {
  const { t } = useTranslations();
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<JobFormSettingsType>(defaultJobFormSettings);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const result = await getUserSettings();
        if (result.success && result.data?.settings?.jobForm) {
          setSettings({ ...defaultJobFormSettings, ...result.data.settings.jobForm });
        }
      } catch (error) {
        console.error("Error fetching job form settings:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleToggle = async (update: Partial<JobFormSettingsType>) => {
    const previous = settings;
    const newSettings = { ...settings, ...update };
    setSettings(newSettings);
    try {
      const result = await updateJobFormSettings(newSettings);
      if (result.success) {
        toast({ variant: "success", title: t("settings.saved") });
      } else {
        toast({ variant: "destructive", title: t("settings.error"), description: t("settings.saveFailed") });
        setSettings(previous);
      }
    } catch {
      toast({ variant: "destructive", title: t("settings.error"), description: t("settings.saveFailed") });
      setSettings(previous);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{t("settings.jobFormSettings")}</h3>
        <p className="text-sm text-muted-foreground">{t("settings.jobFormSettingsDesc")}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          <span>{t("settings.loadingSettings")}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="fixum-disables-range">{t("settings.fixumDisablesRange")}</Label>
            <p className="text-sm text-muted-foreground">{t("settings.fixumDisablesRangeDesc")}</p>
          </div>
          <Switch
            id="fixum-disables-range"
            checked={settings.fixumDisablesRange}
            onCheckedChange={(checked) => handleToggle({ fixumDisablesRange: checked })}
            aria-label={t("settings.fixumDisablesRange")}
          />
        </div>
      )}
    </div>
  );
}

export default JobFormSettings;
