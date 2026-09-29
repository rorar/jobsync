import { AiModuleId } from "./ai.model";
import type { NotificationPreferences } from "./notification.model";

export interface AiSettings {
  moduleId: AiModuleId;
  model: string | undefined;
}

/** User-overridable format preferences. When undefined, Intl defaults for the locale are used. */
export interface FormatSettings {
  /** Override date style: "short" (3/23/26), "medium" (Mar 23, 2026), "long" (March 23, 2026) */
  dateStyle?: "short" | "medium" | "long";
  /** Override time format: "12h" or "24h". Default: locale-specific (e.g., 24h for DE, 12h for EN) */
  timeFormat?: "12h" | "24h";
  /** First day of week: 0=Sunday (US), 1=Monday (EU). Default: locale-specific */
  firstDayOfWeek?: 0 | 1;
}

export interface DisplaySettings {
  theme: "light" | "dark" | "system";
  locale: string;
  /** Optional format overrides — when absent, Intl locale defaults are used (CLDR) */
  format?: FormatSettings;
}

export interface DeveloperSettings {
  debugLogging: boolean;
  logCategories: {
    scheduler: boolean;
    runner: boolean;
    automationLogger: boolean;
  };
  /** Comma-separated list of allowed dev origins (e.g., "http://192.168.1.100:3737") */
  allowedDevOrigins?: string;
  /** Enable client-side error reporting (default: true in development, false in production) */
  errorReporting?: boolean;
}

export interface AutomationSettings {
  /** Show warning when user has many automations (default: true) */
  performanceWarningEnabled: boolean;
  /** Threshold for the performance warning (default: 10) */
  performanceWarningThreshold: number;
}

/** Job form preferences (Welle 2 Phase 3). */
export interface JobFormSettings {
  /**
   * When true (default), entering a Fixum (fixed salary) disables the salary
   * range inputs in the Job form. UI affordance only — no storage-level effect.
   * (compensation.allium: fixum_disables_range)
   */
  fixumDisablesRange: boolean;
}

export interface LogoAssetConfig {
  maxFileSize: number;    // Default: 524288 (512KB)
  maxDimension: number;   // Default: 512px bounding box
}

/** GDPR Privacy & Security settings (F-1, F-2, F-4) */
export interface PrivacySettings {
  /** F-1: Write AdminAuditLog entry before account deletion */
  auditAccountDeletion: boolean;
  /** F-2: Require email confirmation before deletion proceeds */
  emailConfirmationBeforeDeletion: boolean;
  /** F-4: Days to wait before executing deletion (0 = immediate) */
  coolingOffDays: 0 | 7 | 14 | 30;
  /**
   * CRM retention: whether auto-created contacts are ERASED automatically once
   * their retention period elapses (specs/crm.allium ExpireAutoCreatedPersons).
   *
   * `false` does NOT mean "keep forever". The retention period stays declared,
   * `retentionExpiresAt` is still written and still advanced by the last-activity
   * clock, and the date stays visible on the contact. Only the unattended erasure
   * stops — the operator takes the storage-limitation duty (Art. 5(1)(e)) over by
   * hand. Default `true`: the enforcing value is the safe one.
   */
  crmRetentionEnabled: boolean;
  /**
   * CRM retention period in days, measured from last activity (not creation).
   *
   * Deliberately a BOUNDED union with no "unlimited" member: Art. 5(1)(e) does
   * not permit "never", so offering indefinite retention as a configuration
   * would re-create the very defect this setting exists to fix. The 1095-day
   * ceiling matches RETENTION_CONFIG.crmActivityLogRetentionDays, so a Person is
   * never retained longer than its own timeline.
   */
  crmRetentionDays: 180 | 365 | 730 | 1095;
}

export interface UserSettingsData {
  ai: AiSettings;
  display: DisplaySettings;
  developer?: DeveloperSettings;
  automation?: AutomationSettings;
  jobForm?: JobFormSettings;
  notifications?: NotificationPreferences;
  logoAsset?: LogoAssetConfig;
  privacy?: PrivacySettings;
}

export const defaultJobFormSettings: JobFormSettings = {
  fixumDisablesRange: true,
};

export interface UserSettings {
  userId: string;
  settings: UserSettingsData;
}

export const defaultLogoAssetConfig: LogoAssetConfig = {
  maxFileSize: 524288,   // 512KB
  maxDimension: 512,     // 512px bounding box
};

export const defaultPrivacySettings: PrivacySettings = {
  auditAccountDeletion: true,
  emailConfirmationBeforeDeletion: false,
  coolingOffDays: 0,
  // Enforcing default (see PrivacySettings.crmRetentionEnabled).
  crmRetentionEnabled: true,
  // 730 == CRM_CONFIG.autoCreatedRetentionDays: an operator who never opens the
  // setting keeps exactly today's declared policy.
  crmRetentionDays: 730,
};

/** Allowed CRM retention periods (ADR-019 runtime validation source of truth). */
export const ALLOWED_CRM_RETENTION_DAYS = [180, 365, 730, 1095] as const;
export type CrmRetentionDays = (typeof ALLOWED_CRM_RETENTION_DAYS)[number];

export const defaultUserSettings: UserSettingsData = {
  ai: {
    moduleId: AiModuleId.OLLAMA,
    model: undefined,
  },
  display: {
    theme: "system",
    locale: "en",
  },
  developer: {
    debugLogging: true,
    logCategories: {
      scheduler: true,
      runner: true,
      automationLogger: true,
    },
  },
  automation: {
    performanceWarningEnabled: true,
    performanceWarningThreshold: 10,
  },
  jobForm: {
    fixumDisablesRange: true,
  },
};
