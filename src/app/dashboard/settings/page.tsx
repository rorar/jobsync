"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AiSettings from "@/components/settings/AiSettings";
import ApiKeySettings from "@/components/settings/ApiKeySettings";
import AutomationSettings from "@/components/settings/AutomationSettings";
import JobFormSettings from "@/components/settings/JobFormSettings";
import JobStatusSettings from "@/components/settings/JobStatusSettings";
import DeveloperSettings from "@/components/settings/DeveloperSettings";
import DisplaySettings from "@/components/settings/DisplaySettings";
import ErrorLogSettings from "@/components/settings/ErrorLogSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import PublicApiKeySettings from "@/components/settings/PublicApiKeySettings";
import PushSettings from "@/components/settings/PushSettings";
import SmtpSettings from "@/components/settings/SmtpSettings";
import WebhookSettings from "@/components/settings/WebhookSettings";
import CompanyBlacklistSettings from "@/components/settings/CompanyBlacklistSettings";
import EnrichmentModuleSettings from "@/components/settings/EnrichmentModuleSettings";
import ApiStatusOverview from "@/components/settings/ApiStatusOverview";
import LogoAssetSettings from "@/components/settings/LogoAssetSettings";
import AccountDeletionSettings from "@/components/settings/AccountDeletionSettings";
import PrivacySecuritySettings from "@/components/settings/PrivacySecuritySettings";
import SettingsSidebar, { type SettingsSection } from "@/components/settings/SettingsSidebar";
import { useTranslations } from "@/i18n";

const VALID_SECTIONS: SettingsSection[] = [
  "ai-module", "api-keys", "public-api", "appearance", "automation", "job-form",
  "statuses", "enrichment", "api-status", "logo-cache", "notifications", "webhooks",
  "email", "push", "blacklist", "developer", "error-log", "privacy", "danger-zone",
];

function Settings() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<SettingsSection>("ai-module");
  const { t } = useTranslations();

  // Deep-link support: ?section=statuses selects a section on load (e.g. the
  // Kanban "Manage statuses" entry-point). Validated against the known set.
  useEffect(() => {
    const requested = searchParams.get("section");
    if (requested && (VALID_SECTIONS as string[]).includes(requested)) {
      setActiveSection(requested as SettingsSection);
    }
  }, [searchParams]);

  return (
    <div className="flex flex-col col-span-3">
      <h3 className="text-2xl font-semibold leading-none tracking-tight mb-4">
        {t("settings.pageTitle")}
      </h3>
      <div className="flex flex-col md:flex-row gap-6">
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
        <div className="flex-1 min-w-0">
          {activeSection === "ai-module" && <AiSettings />}
          {activeSection === "api-keys" && <ApiKeySettings />}
          {activeSection === "public-api" && <PublicApiKeySettings />}
          {activeSection === "appearance" && <DisplaySettings />}
          {activeSection === "automation" && <AutomationSettings />}
          {activeSection === "job-form" && <JobFormSettings />}
          {activeSection === "statuses" && <JobStatusSettings />}
          {activeSection === "enrichment" && <EnrichmentModuleSettings />}
          {activeSection === "api-status" && <ApiStatusOverview />}
          {activeSection === "logo-cache" && <LogoAssetSettings />}
          {activeSection === "notifications" && <NotificationSettings />}
          {activeSection === "webhooks" && <WebhookSettings />}
          {activeSection === "email" && <SmtpSettings />}
          {activeSection === "push" && <PushSettings />}
          {activeSection === "blacklist" && <CompanyBlacklistSettings />}
          {activeSection === "developer" && <DeveloperSettings />}
          {activeSection === "error-log" && <ErrorLogSettings />}
          {activeSection === "privacy" && <PrivacySecuritySettings />}
          {activeSection === "danger-zone" && <AccountDeletionSettings />}
        </div>
      </div>
    </div>
  );
}

export default Settings;
