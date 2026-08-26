export type DebugCategory =
  | "scheduler"
  | "runner"
  | "automationLogger"
  | "crm-cron"
  // Retention-policy writes fire from server actions (updatePerson,
  // updatePrivacySettings) as well as the cron, so they are NOT "crm-cron".
  | "crm-retention";

/**
 * Gated debug logging. Checks DEBUG_LOGGING env variable.
 * Default: enabled (logs unless DEBUG_LOGGING=false).
 */
export function debugLog(category: DebugCategory, ...args: unknown[]): void {
  if (process.env.DEBUG_LOGGING === "false") return;
  console.log(`[${category}]`, ...args);
}

export function debugError(category: DebugCategory, ...args: unknown[]): void {
  if (process.env.DEBUG_LOGGING === "false") return;
  console.error(`[${category}]`, ...args);
}
