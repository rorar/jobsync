import "server-only";

import { moduleRegistry } from "./registry";
import { checkModuleHealth } from "./health-monitor";
import { ModuleStatus } from "./manifest";
import { debugLog } from "@/lib/debug";

let schedulerStarted = false;
const timers = new Map<string, NodeJS.Timeout>();

/**
 * Start periodic health checks for all active modules with health configs.
 * Idempotent -- safe to call multiple times (e.g., from middleware or HMR).
 *
 * See: specs/module-lifecycle.allium, rule HealthCheckExecution
 */
export function startHealthScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const modules = moduleRegistry
    .availableModules()
    .map((id) => moduleRegistry.get(id))
    .filter(
      (m) =>
        m !== undefined &&
        m.status === ModuleStatus.ACTIVE &&
        m.manifest.healthCheck !== undefined,
    );

  for (const mod of modules) {
    const intervalMs = mod!.manifest.healthCheck!.intervalMs;
    const moduleId = mod!.manifest.id;

    // Initial check after 10 seconds (not immediately -- let the app warm up)
    setTimeout(() => {
      checkModuleHealth(moduleId).catch(console.error);
    }, 10_000);

    // Periodic check at the interval declared in the module manifest
    const interval = setInterval(() => {
      checkModuleHealth(moduleId).catch(console.error);
    }, intervalMs);

    timers.set(moduleId, interval);
  }

  debugLog(
    "scheduler",
    `[HealthScheduler] Started for ${modules.length} module(s)`,
  );
}

/**
 * Stop all health check timers. Used for testing/shutdown.
 */
export function stopHealthScheduler(): void {
  for (const [, timer] of timers) {
    clearInterval(timer);
  }
  timers.clear();
  schedulerStarted = false;
}
