"use client";

import { useEffect, useState } from "react";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { toast } from "../ui/use-toast";
import { Loader2 } from "lucide-react";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/actions/userSettings.actions";
import { useTranslations } from "@/i18n";
import type { NotificationPreferences } from "@/models/notification.model";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  CONFIGURABLE_NOTIFICATION_TYPES,
} from "@/models/notification.model";
import type { NotificationType } from "@/models/notification.model";

const COMMON_TIMEZONES = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Vienna",
  "Europe/Zurich",
  "Europe/Warsaw",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Lisbon",
  "Europe/Dublin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

function NotificationSettings() {
  const { t } = useTranslations();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );

  useEffect(() => {
    const fetchPrefs = async () => {
      setIsLoading(true);
      try {
        const result = await getNotificationPreferences();
        if (result.success && result.data) {
          setPrefs(result.data);
        }
      } catch (error) {
        console.error("Error fetching notification preferences:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPrefs();
  }, []);

  const save = async (updated: NotificationPreferences) => {
    setPrefs(updated);
    setIsSaving(true);
    try {
      const result = await updateNotificationPreferences(updated);
      if (result.success) {
        toast({
          variant: "success",
          title: t("settings.saved"),
          description: t("settings.notificationSaved"),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.error"),
          description: t("settings.notificationSaveFailed"),
        });
        // revert on failure
        setPrefs(prefs);
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.error"),
        description: t("settings.notificationSaveFailed"),
      });
      setPrefs(prefs);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGlobalToggle = (enabled: boolean) => {
    save({ ...prefs, enabled });
  };

  const handleInAppToggle = (inApp: boolean) => {
    save({ ...prefs, channels: { ...prefs.channels, inApp } });
  };

  const handlePerTypeToggle = (type: NotificationType, enabled: boolean) => {
    save({
      ...prefs,
      perType: {
        ...prefs.perType,
        [type]: { enabled },
      },
    });
  };

  const handleQuietHoursToggle = (enabled: boolean) => {
    const qh = prefs.quietHours ?? {
      enabled: false,
      start: "22:00",
      end: "07:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
    };
    save({
      ...prefs,
      quietHours: { ...qh, enabled },
    });
  };

  const handleQuietHoursChange = (
    field: "start" | "end" | "timezone",
    value: string,
  ) => {
    const qh = prefs.quietHours ?? {
      enabled: true,
      start: "22:00",
      end: "07:00",
      timezone: "Europe/Berlin",
    };
    save({
      ...prefs,
      quietHours: { ...qh, [field]: value },
    });
  };

  const isTypeEnabled = (type: NotificationType): boolean => {
    const entry = prefs.perType[type];
    // If no explicit override, default to enabled
    return entry?.enabled ?? true;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">
            {t("settings.notificationSettings")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.notificationSettingsDesc")}
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
        <h3 className="text-lg font-medium">
          {t("settings.notificationSettings")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.notificationSettingsDesc")}
        </p>
      </div>

      {/* Global enable/disable */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="notifications-enabled">
            {t("settings.notificationsEnabled")}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t("settings.notificationsEnabledDesc")}
          </p>
        </div>
        <Switch
          id="notifications-enabled"
          checked={prefs.enabled}
          onCheckedChange={handleGlobalToggle}
          disabled={isSaving}
          aria-label={t("settings.notificationsEnabled")}
        />
      </div>

      {/* In-App channel toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="inapp-channel">
            {t("settings.inAppChannel")}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t("settings.inAppChannelDesc")}
          </p>
        </div>
        <Switch
          id="inapp-channel"
          checked={prefs.channels.inApp}
          onCheckedChange={handleInAppToggle}
          disabled={isSaving || !prefs.enabled}
          aria-label={t("settings.inAppChannel")}
        />
      </div>

      {/* Per-type toggles */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="space-y-0.5">
          <Label>{t("settings.perTypeSettings")}</Label>
          <p className="text-sm text-muted-foreground">
            {t("settings.perTypeSettingsDesc")}
          </p>
        </div>
        <div className="space-y-2">
          {CONFIGURABLE_NOTIFICATION_TYPES.map((type) => (
            <div
              key={type}
              className="flex items-center justify-between py-1"
            >
              <span className="text-sm">
                {t(`settings.notificationType.${type}`)}
              </span>
              <Switch
                checked={isTypeEnabled(type)}
                onCheckedChange={(checked) =>
                  handlePerTypeToggle(type, checked)
                }
                disabled={isSaving || !prefs.enabled}
                aria-label={t(`settings.notificationType.${type}`)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="quiet-hours-enabled">
              {t("settings.quietHours")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("settings.quietHoursDesc")}
            </p>
          </div>
          <Switch
            id="quiet-hours-enabled"
            checked={prefs.quietHours?.enabled ?? false}
            onCheckedChange={handleQuietHoursToggle}
            disabled={isSaving || !prefs.enabled}
            aria-label={t("settings.quietHours")}
          />
        </div>

        {prefs.quietHours?.enabled && (
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="space-y-1">
              <Label htmlFor="quiet-start" className="text-xs">
                {t("settings.quietHoursStart")}
              </Label>
              <Input
                id="quiet-start"
                type="time"
                value={prefs.quietHours.start}
                onChange={(e) =>
                  handleQuietHoursChange("start", e.target.value)
                }
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quiet-end" className="text-xs">
                {t("settings.quietHoursEnd")}
              </Label>
              <Input
                id="quiet-end"
                type="time"
                value={prefs.quietHours.end}
                onChange={(e) =>
                  handleQuietHoursChange("end", e.target.value)
                }
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quiet-timezone" className="text-xs">
                {t("settings.quietHoursTimezone")}
              </Label>
              <select
                id="quiet-timezone"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={prefs.quietHours.timezone}
                onChange={(e) =>
                  handleQuietHoursChange("timezone", e.target.value)
                }
                disabled={isSaving}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {isSaving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          <span>{t("settings.loadingSettings")}</span>
        </div>
      )}
    </div>
  );
}

export default NotificationSettings;
