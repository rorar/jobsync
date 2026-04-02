"use client";

import { useEffect, useState } from "react";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { toast } from "../ui/use-toast";
import { Check, Loader2 } from "lucide-react";
import { getUserSettings, updateAutomationSettings } from "@/actions/userSettings.actions";
import { useTranslations } from "@/i18n";
import type { AutomationSettings as AutomationSettingsType } from "@/models/userSettings.model";

const defaultAutomation: AutomationSettingsType = {
  performanceWarningEnabled: true,
  performanceWarningThreshold: 10,
};

function AutomationSettings() {
  const { t } = useTranslations();
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<AutomationSettingsType>(defaultAutomation);
  const [thresholdInput, setThresholdInput] = useState("10");

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const result = await getUserSettings();
        if (result.success && (result.data as any)?.settings?.automation) {
          const automation = (result.data as any).settings.automation;
          const merged = { ...defaultAutomation, ...automation };
          setSettings(merged);
          setThresholdInput(String(merged.performanceWarningThreshold));
        }
      } catch (error) {
        console.error("Error fetching automation settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleToggle = async (update: Partial<AutomationSettingsType>) => {
    const newSettings: AutomationSettingsType = {
      ...settings,
      ...update,
    };
    setSettings(newSettings);

    try {
      const result = await updateAutomationSettings(newSettings);
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

  const handleThresholdSave = () => {
    const value = parseInt(thresholdInput, 10);
    if (isNaN(value) || value < 1) {
      setThresholdInput(String(settings.performanceWarningThreshold));
      return;
    }
    handleToggle({ performanceWarningThreshold: value });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("settings.automationSettings")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.automationSettingsDesc")}
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
        <h3 className="text-lg font-medium">{t("settings.automationSettings")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.automationSettingsDesc")}
        </p>
      </div>

      <div className="space-y-4">
        {/* Performance warning toggle */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="performance-warning">
              {t("settings.automationPerformanceWarning")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("settings.automationPerformanceWarningDesc")}
            </p>
          </div>
          <Switch
            id="performance-warning"
            checked={settings.performanceWarningEnabled}
            onCheckedChange={(checked) =>
              handleToggle({ performanceWarningEnabled: checked })
            }
            aria-label={t("settings.automationPerformanceWarning")}
          />
        </div>

        {/* Performance warning threshold */}
        <div className="rounded-lg border p-4 space-y-2">
          <div className="space-y-0.5">
            <Label htmlFor="performance-threshold">
              {t("settings.automationPerformanceThreshold")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("settings.automationPerformanceThresholdDesc")}
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              id="performance-threshold"
              type="number"
              min={1}
              className="w-24"
              value={thresholdInput}
              disabled={!settings.performanceWarningEnabled}
              onChange={(e) => setThresholdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleThresholdSave();
                }
              }}
            />
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              disabled={!settings.performanceWarningEnabled}
              onClick={handleThresholdSave}
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

export default AutomationSettings;
