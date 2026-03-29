import "server-only";

import prisma from "@/lib/db";
import { moduleRegistry } from "./registry";
import { isBlockedHealthCheckUrl } from "@/lib/url-validation";
import {
  HealthStatus,
  ModuleStatus,
  type RegisteredModule,
  type HealthCheckConfig,
} from "./manifest";

const MAX_FAILURES_BEFORE_UNREACHABLE = 3;

interface HealthCheckResult {
  moduleId: string;
  success: boolean;
  healthStatus: HealthStatus;
  responseTimeMs: number;
  error?: string;
}

/**
 * Execute a health check for a single module based on its manifest config.
 * Updates both the in-memory registry and the DB.
 *
 * See: specs/module-lifecycle.allium, rule HealthCheckExecution
 */
export async function checkModuleHealth(
  moduleId: string,
): Promise<HealthCheckResult> {
  const registered = moduleRegistry.get(moduleId);
  if (!registered) {
    return {
      moduleId,
      success: false,
      healthStatus: HealthStatus.UNKNOWN,
      responseTimeMs: 0,
      error: `Module "${moduleId}" not found`,
    };
  }

  if (registered.status !== ModuleStatus.ACTIVE) {
    return {
      moduleId,
      success: false,
      healthStatus: HealthStatus.UNKNOWN,
      responseTimeMs: 0,
      error: "Module is not active",
    };
  }

  const healthConfig = registered.manifest.healthCheck;
  if (!healthConfig) {
    return {
      moduleId,
      success: true,
      healthStatus: HealthStatus.UNKNOWN,
      responseTimeMs: 0,
    };
  }

  const start = Date.now();
  const probeResult = await probeEndpoint(healthConfig, registered);
  const responseTimeMs = Date.now() - start;

  // Determine new health status based on probe result and consecutive failures
  let newHealthStatus: HealthStatus;
  let consecutiveFailures = 0;

  if (probeResult.success) {
    newHealthStatus = HealthStatus.HEALTHY;
    consecutiveFailures = 0;
  } else {
    // Track consecutive failures for degradation
    const currentFailures =
      registered.healthStatus !== HealthStatus.HEALTHY
        ? (registered.consecutiveFailures ?? 0) + 1
        : 1;
    consecutiveFailures = currentFailures;

    if (currentFailures >= MAX_FAILURES_BEFORE_UNREACHABLE) {
      newHealthStatus = HealthStatus.UNREACHABLE;
    } else {
      newHealthStatus = HealthStatus.DEGRADED;
    }
  }

  // Update in-memory registry via dedicated mutation methods
  moduleRegistry.updateCircuitBreaker(moduleId, consecutiveFailures);
  moduleRegistry.updateHealth(
    moduleId,
    newHealthStatus,
    new Date(),
    probeResult.success ? new Date() : undefined,
  );

  // Persist to DB (best-effort)
  try {
    await prisma.moduleRegistration.upsert({
      where: { moduleId },
      update: {
        healthStatus: newHealthStatus,
        updatedAt: new Date(),
      },
      create: {
        moduleId,
        connectorType: registered.manifest.connectorType,
        status: registered.status,
        healthStatus: newHealthStatus,
      },
    });
  } catch {
    // DB persistence failure doesn't break health monitoring
  }

  return {
    moduleId,
    success: probeResult.success,
    healthStatus: newHealthStatus,
    responseTimeMs,
    error: probeResult.error,
  };
}

/**
 * Check health of all active modules that have health check configs.
 */
export async function checkAllModuleHealth(): Promise<HealthCheckResult[]> {
  const activeModules = moduleRegistry.availableModules()
    .map((id) => moduleRegistry.get(id))
    .filter((m): m is RegisteredModule =>
      m !== undefined &&
      m.status === ModuleStatus.ACTIVE &&
      m.manifest.healthCheck !== undefined,
    );

  const results: HealthCheckResult[] = [];
  for (const mod of activeModules) {
    const result = await checkModuleHealth(mod.manifest.id);
    results.push(result);
  }

  return results;
}

/**
 * Probe a health endpoint. Supports both absolute URLs (job discovery)
 * and relative paths (AI providers — needs base URL from credential).
 */
async function probeEndpoint(
  config: HealthCheckConfig,
  registered: RegisteredModule,
): Promise<{ success: boolean; error?: string }> {
  if (!config.endpoint) {
    return { success: true }; // No endpoint = assume healthy
  }

  try {
    const url = config.endpoint.startsWith("http")
      ? config.endpoint
      : // Relative path: resolve against credential default (e.g. Ollama base URL)
        `${registered.manifest.credential.defaultValue ?? ""}${config.endpoint}`;

    if (!url || !url.startsWith("http")) {
      return { success: false, error: "No valid health check URL" };
    }

    if (isBlockedHealthCheckUrl(url)) {
      return { success: false, error: "Health check blocked: private/metadata URL" };
    }

    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
