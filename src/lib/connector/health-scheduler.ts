import "server-only";
import "./register-all";

import { moduleRegistry } from "./registry";
import { checkModuleHealth } from "./health-monitor";
import { ModuleStatus } from "./manifest";
import { debugLog } from "@/lib/debug";

// Use globalThis to survive HMR — module-level variables are reset on hot reload,
// but globalThis persists across HMR cycles in the same process.
const g = globalThis as unknown as {
  __healthTimers?: Map<string, NodeJS.Timeout>;
  __healthInitials?: NodeJS.Timeout[];
  __healthStarted?: boolean;
};

if (!g.__healthTimers) g.__healthTimers = new Map();
if (!g.__healthInitials) g.__healthInitials = [];

/**
 * Start periodic health checks for all active modules with health configs.
 * Idempotent -- safe to call multiple times (e.g., from middleware or HMR).
 *
 * See: specs/module-lifecycle.allium, rule HealthCheckExecution
 */
export function startHealthScheduler(): void {
  if (g.__healthStarted) return;
  g.__healthStarted = true;

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
    const initial = setTimeout(() => {
      checkModuleHealth(moduleId).catch(console.error);
    }, 10_000);
    g.__healthInitials!.push(initial);

    // Periodic check at the interval declared in the module manifest
    const interval = setInterval(() => {
      checkModuleHealth(moduleId).catch(console.error);
    }, intervalMs);

    g.__healthTimers!.set(moduleId, interval);
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
  for (const initial of g.__healthInitials!) {
    clearTimeout(initial);
  }
  g.__healthInitials!.length = 0;

  for (const [, timer] of g.__healthTimers!) {
    clearInterval(timer);
  }
  g.__healthTimers!.clear();
  g.__healthStarted = false;
}
