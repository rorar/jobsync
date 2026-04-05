"use client";

import { useState } from "react";
import AiSettings from "@/components/settings/AiSettings";
import ApiKeySettings from "@/components/settings/ApiKeySettings";
import AutomationSettings from "@/components/settings/AutomationSettings";
import DeveloperSettings from "@/components/settings/DeveloperSettings";
import DisplaySettings from "@/components/settings/DisplaySettings";
import ErrorLogSettings from "@/components/settings/ErrorLogSettings";
import NotificationSettings from "@/components/settings/NotificationSettings";
import PublicApiKeySettings from "@/components/settings/PublicApiKeySettings";
import SmtpSettings from "@/components/settings/SmtpSettings";
import WebhookSettings from "@/components/settings/WebhookSettings";
import CompanyBlacklistSettings from "@/components/settings/CompanyBlacklistSettings";
import EnrichmentModuleSettings from "@/components/settings/EnrichmentModuleSettings";
import SettingsSidebar, { type SettingsSection } from "@/components/settings/SettingsSidebar";

function Settings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("ai-module");

  return (
    <div className="flex flex-col col-span-3">
      <h3 className="text-2xl font-semibold leading-none tracking-tight mb-4">
        Settings
      </h3>
      <div className="flex gap-6">
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
          {activeSection === "enrichment" && <EnrichmentModuleSettings />}
          {activeSection === "notifications" && <NotificationSettings />}
          {activeSection === "webhooks" && <WebhookSettings />}
          {activeSection === "email" && <SmtpSettings />}
          {activeSection === "blacklist" && <CompanyBlacklistSettings />}
          {activeSection === "developer" && <DeveloperSettings />}
          {activeSection === "error-log" && <ErrorLogSettings />}
        </div>
      </div>
    </div>
  );
}

export default Settings;
