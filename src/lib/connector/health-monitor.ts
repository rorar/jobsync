import "server-only";

import prisma from "@/lib/db";
import { moduleRegistry } from "./registry";
import { isBlockedHealthCheckUrl } from "@/lib/url-validation";
import {
  CredentialType,
  HealthStatus,
  ModuleStatus,
  type RegisteredModule,
  type HealthCheckConfig,
  type DependencyHealthCheck,
} from "./manifest";

const MAX_FAILURES_BEFORE_UNREACHABLE = 3;

export interface DependencyCheckResult {
  id: string;
  name: string;
  success: boolean;
  error?: string;
}

export interface DependencyHealthResult {
  /** Aggregate: healthy if all pass, degraded if any fail. Never unreachable. */
  status: HealthStatus;
  results: DependencyCheckResult[];
}

/**
 * Check health of a module's declared dependencies.
 * Returns DEGRADED if any fail, HEALTHY if all pass. Never UNREACHABLE.
 * See: specs/module-lifecycle.allium, rule DependencyHealthDegradation
 */
export async function checkDependencyHealth(
  dependencies: DependencyHealthCheck[],
): Promise<DependencyHealthResult> {
  if (dependencies.length === 0) {
    return { status: HealthStatus.HEALTHY, results: [] };
  }

  const results: DependencyCheckResult[] = [];

  for (const dep of dependencies) {
    try {
      const response = await fetch(dep.endpoint, {
        method: "GET",
        signal: AbortSignal.timeout(dep.timeoutMs),
      });

      results.push({
        id: dep.id,
        name: dep.name,
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
      });
    } catch (error) {
      results.push({
        id: dep.id,
        name: dep.name,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const anyFailed = results.some((r) => !r.success);
  return {
    status: anyFailed ? HealthStatus.DEGRADED : HealthStatus.HEALTHY,
    results,
  };
}

interface HealthCheckResult {
  moduleId: string;
  success: boolean;
  healthStatus: HealthStatus;
  responseTimeMs: number;
  error?: string;
  dependencyResults?: DependencyCheckResult[];
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

  // For key-based modules, resolve credential from env for health check.
  // Health checks are module-wide (no userId), so only env fallback is used.
  // If no key is configured, return UNKNOWN rather than probing (which would 401/404).
  let resolvedHealthConfig = healthConfig;
  const cred = registered.manifest.credential;
  if (cred.type !== CredentialType.NONE && cred.envFallback) {
    const envKey = process.env[cred.envFallback];
    if (!envKey) {
      return {
        moduleId,
        success: false,
        healthStatus: HealthStatus.UNKNOWN,
        responseTimeMs: 0,
        error: "No credential configured — health check skipped",
      };
    }
    // Append token to health check endpoint if it's an absolute URL
    if (healthConfig.endpoint?.startsWith("http")) {
      const separator = healthConfig.endpoint.includes("?") ? "&" : "?";
      resolvedHealthConfig = {
        ...healthConfig,
        endpoint: `${healthConfig.endpoint}${separator}token=${encodeURIComponent(envKey)}`,
      };
    }
  }

  const start = Date.now();
  const probeResult = await probeEndpoint(resolvedHealthConfig, registered);
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

  // Update in-memory registry via dedicated mutation method
  // Note: health-check failure counts are tracked via updateHealth, NOT updateCircuitBreaker.
  // updateCircuitBreaker is for CB state transitions only (degradation.ts).
  moduleRegistry.updateHealth(
    moduleId,
    newHealthStatus,
    new Date(),
    probeResult.success ? new Date() : undefined,
    consecutiveFailures,
  );

  // Check dependencies (spec: DependencyHealthDegradation rule)
  const dependencies = registered.manifest.dependencies;
  let depResult: DependencyHealthResult | undefined;
  if (dependencies && dependencies.length > 0) {
    depResult = await checkDependencyHealth(dependencies);
    // Dependencies can only RAISE to degraded, never to unreachable
    if (depResult.status === HealthStatus.DEGRADED && newHealthStatus === HealthStatus.HEALTHY) {
      newHealthStatus = HealthStatus.DEGRADED;
      // Re-update registry with degraded status
      moduleRegistry.updateHealth(moduleId, newHealthStatus, new Date(), undefined, consecutiveFailures);
    }
  }

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
    dependencyResults: depResult?.results,
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
