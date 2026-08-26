"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "@/i18n";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { toast } from "@/components/ui/use-toast";
import { Loader2, ShieldCheck, Scale } from "lucide-react";
import DataExportSettings from "@/components/settings/DataExportSettings";
import {
  getPrivacySettings,
  updatePrivacySettings,
  getSmtpAvailable,
} from "@/actions/privacy.actions";
import {
  defaultPrivacySettings,
  type PrivacySettings,
} from "@/models/userSettings.model";

export default function PrivacySecuritySettings() {
  const { t } = useTranslations();
  const [settings, setSettings] =
    useState<PrivacySettings>(defaultPrivacySettings);
  const [smtpAvailable, setSmtpAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [privacyResult, smtpResult] = await Promise.all([
          getPrivacySettings(),
          getSmtpAvailable(),
        ]);
        if (privacyResult.success && privacyResult.data) {
          setSettings(privacyResult.data);
        }
        if (smtpResult.success && smtpResult.data !== undefined) {
          setSmtpAvailable(smtpResult.data);
        }
      } catch (error) {
        console.error("Error fetching privacy settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const save = useCallback(
    async (updated: PrivacySettings) => {
      const previous = settings;
      setSettings(updated);
      setIsSaving(true);
      try {
        const result = await updatePrivacySettings(updated);
        if (result.success) {
          toast({
            variant: "success",
            title: t("settings.saved"),
            description: t("settings.privacySaved"),
          });
        } else {
          toast({
            variant: "destructive",
            title: t("settings.error"),
            description: t("settings.privacySaveFailed"),
          });
          setSettings(previous);
        }
      } catch {
        toast({
          variant: "destructive",
          title: t("settings.error"),
          description: t("settings.privacySaveFailed"),
        });
        setSettings(previous);
      } finally {
        setIsSaving(false);
      }
    },
    [settings, t],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("settings.privacyTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.privacyDesc")}
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
        <h3 className="text-lg font-medium flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t("settings.privacyTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.privacyDesc")}
        </p>
      </div>

      {/* F-1: Audit Trail Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="audit-trail">
              {t("settings.privacyAuditLabel")}
            </Label>
            <Badge variant="secondary">{t("settings.recommended")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("settings.privacyAuditDesc")}
          </p>
        </div>
        <Switch
          id="audit-trail"
          checked={settings.auditAccountDeletion}
          onCheckedChange={(checked) =>
            save({ ...settings, auditAccountDeletion: checked })
          }
          disabled={isSaving}
          aria-label={t("settings.privacyAuditLabel")}
        />
      </div>

      {/* F-2: Email Confirmation Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="email-confirmation">
              {t("settings.privacyEmailConfirmLabel")}
            </Label>
            {!smtpAvailable && (
              <InfoTooltip>
                {t("settings.privacyEmailConfirmDisabledTooltip")}
              </InfoTooltip>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("settings.privacyEmailConfirmDesc")}
          </p>
        </div>
        <Switch
          id="email-confirmation"
          checked={settings.emailConfirmationBeforeDeletion}
          onCheckedChange={(checked) =>
            save({ ...settings, emailConfirmationBeforeDeletion: checked })
          }
          disabled={isSaving || !smtpAvailable}
          aria-label={t("settings.privacyEmailConfirmLabel")}
        />
      </div>

      {/* F-4: Cooling-off Period Select */}
      <div className="rounded-lg border p-4 space-y-2">
        <div className="space-y-0.5">
          <Label htmlFor="cooling-off-period">
            {t("settings.privacyCoolingOffLabel")}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t("settings.privacyCoolingOffDesc")}
          </p>
        </div>
        <Select
          value={String(settings.coolingOffDays)}
          onValueChange={(value) =>
            save({
              ...settings,
              coolingOffDays: Number(value) as 0 | 7 | 14 | 30,
            })
          }
          disabled={isSaving}
        >
          <SelectTrigger id="cooling-off-period" className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">
              {t("settings.privacyCoolingOffImmediate")}
            </SelectItem>
            <SelectItem value="7">
              {t("settings.privacyCoolingOff7")}
            </SelectItem>
            <SelectItem value="14">
              {t("settings.privacyCoolingOff14")}
            </SelectItem>
            <SelectItem value="30">
              {t("settings.privacyCoolingOff30")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/*
        W-B3: CRM data retention (GDPR Art. 5(1)(e) storage limitation).

        Placed in `privacy` rather than `danger-zone` because it is a standing
        data-handling policy, not a one-off destructive act — it belongs beside
        the export control (Art. 15/20), which is the other ongoing GDPR
        surface.
      */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="crm-retention-enabled">
              {t("settings.privacyRetentionLabel")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("settings.privacyRetentionDesc")}
            </p>
          </div>
          <Switch
            id="crm-retention-enabled"
            checked={settings.crmRetentionEnabled}
            onCheckedChange={(checked) =>
              save({ ...settings, crmRetentionEnabled: checked })
            }
            disabled={isSaving}
            aria-label={t("settings.privacyRetentionLabel")}
          />
        </div>

        {/*
          The period select stays ENABLED when automatic erasure is off. That is
          deliberate and is the whole of decision D2: switching the automation
          off does not delete the policy — the period remains the operator's
          declared retention period and each contact keeps showing its expiry
          date. Disabling the control here would say the opposite.
        */}
        <div className="space-y-2 border-t pt-4">
          <div className="space-y-0.5">
            <Label htmlFor="crm-retention-period">
              {t("settings.privacyRetentionPeriodLabel")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("settings.privacyRetentionPeriodDesc")}
            </p>
          </div>
          <Select
            value={String(settings.crmRetentionDays)}
            onValueChange={(value) =>
              save({
                ...settings,
                crmRetentionDays: Number(value) as PrivacySettings["crmRetentionDays"],
              })
            }
            disabled={isSaving}
          >
            <SelectTrigger id="crm-retention-period" className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/*
                No "never" / "unlimited" option, on purpose: Art. 5(1)(e) does
                not permit indefinite retention, so offering it as a menu item
                would smuggle the exact defect this setting exists to fix back
                in as a configuration.
              */}
              <SelectItem value="180">
                {t("settings.privacyRetention180")}
              </SelectItem>
              <SelectItem value="365">
                {t("settings.privacyRetention365")}
              </SelectItem>
              <SelectItem value="730">
                {t("settings.privacyRetention730")}
              </SelectItem>
              <SelectItem value="1095">
                {t("settings.privacyRetention1095")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!settings.crmRetentionEnabled && (
          <p
            className="rounded-md bg-muted p-3 text-sm text-muted-foreground"
            role="status"
          >
            {t("settings.privacyRetentionOffNotice")}
          </p>
        )}

        {/*
          @rorar asked for this warning explicitly. It is always visible — not a
          tooltip, not behind a disclosure — because a warning nobody sees is
          decoration.
        */}
        <div className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <Scale
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {t("settings.privacyRetentionLegalTitle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("settings.privacyRetentionLegalBody")}
            </p>
          </div>
        </div>
      </div>

      {/* S2: Data Export (GDPR Art. 15, 20) */}
      <DataExportSettings />

      {isSaving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          <span>{t("settings.loadingSettings")}</span>
        </div>
      )}
    </div>
  );
}
