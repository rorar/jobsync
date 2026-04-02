/**
 * Shared i18n display key maps for automation status and module identifiers.
 *
 * Extracted from AutomationList.tsx and AutomationMetadataGrid.tsx
 * to eliminate duplication (S2R-BS4).
 *
 * Usage:
 *   import { STATUS_DISPLAY_KEYS, MODULE_DISPLAY_KEYS } from "@/lib/automation-display-keys";
 *   t(STATUS_DISPLAY_KEYS[automation.status] ?? automation.status)
 */

/** Map automation status to i18n keys */
export const STATUS_DISPLAY_KEYS: Record<string, string> = {
  active: "automations.statusActive",
  paused: "automations.statusPaused",
};

/** Map module/jobBoard ids to i18n keys */
export const MODULE_DISPLAY_KEYS: Record<string, string> = {
  eures: "automations.moduleEures",
  arbeitsagentur: "automations.moduleArbeitsagentur",
  jsearch: "automations.moduleJsearch",
};
