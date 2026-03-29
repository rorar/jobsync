"use server";

import prisma from "@/lib/db";
import { moduleRegistry } from "@/lib/connector/registry";
import "@/lib/connector/job-discovery/connectors";
import "@/lib/connector/ai-provider/modules/connectors";
import {
  ConnectorType,
  CredentialType,
  HealthStatus,
  ModuleStatus,
} from "@/lib/connector/manifest";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { checkModuleHealth } from "@/lib/connector/health-monitor";

// =============================================================================
// Types
// =============================================================================

/** Serializable manifest summary for client components */
export interface ModuleManifestSummary {
  moduleId: string;
  name: string;
  connectorType: string;
  status: string;
  healthStatus: string;
  lastHealthCheck?: string;
  lastSuccessfulConnection?: string;
  credential: {
    type: string;
    moduleId: string;
    required: boolean;
    sensitive: boolean;
    placeholder?: string;
    defaultValue?: string;
  };
}

// =============================================================================
// Queries
// =============================================================================

export async function getModuleManifests(
  connectorType?: ConnectorType,
): Promise<ActionResult<ModuleManifestSummary[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, message: "Not authenticated" };

  // Sync registry with DB state
  await syncRegistryFromDb();

  const modules = connectorType
    ? moduleRegistry.getByType(connectorType)
    : [
        ...moduleRegistry.getByType(ConnectorType.JOB_DISCOVERY),
        ...moduleRegistry.getByType(ConnectorType.AI_PROVIDER),
      ];

  // Trigger health checks for unknown-status modules (non-blocking).
  // This ensures the settings page shows fresh health data on first load.
  const unknownModules = modules.filter(
    (m) => m.healthStatus === HealthStatus.UNKNOWN,
  );
  for (const mod of unknownModules) {
    checkModuleHealth(mod.manifest.id).catch(() => {});
  }

  const summaries: ModuleManifestSummary[] = modules.map((m) => ({
    moduleId: m.manifest.id,
    name: m.manifest.name,
    connectorType: m.manifest.connectorType,
    status: m.status,
    healthStatus: m.healthStatus,
    lastHealthCheck: m.lastHealthCheck?.toISOString(),
    lastSuccessfulConnection: m.lastSuccessfulConnection?.toISOString(),
    credential: {
      type: m.manifest.credential.type,
      moduleId: m.manifest.credential.moduleId,
      required: m.manifest.credential.required,
      sensitive: m.manifest.credential.sensitive,
      placeholder: m.manifest.credential.placeholder,
      defaultValue: m.manifest.credential.defaultValue,
    },
  }));

  return { success: true, data: summaries };
}

/**
 * Get manifests that require user credentials (for settings UI).
 * Filters out modules with CredentialType.NONE.
 */
export async function getCredentialModules(): Promise<
  ActionResult<ModuleManifestSummary[]>
> {
  const result = await getModuleManifests();
  if (!result.success || !result.data) return result;

  const filtered = result.data.filter(
    (m) => m.credential.type !== CredentialType.NONE,
  );

  return { success: true, data: filtered };
}

/**
 * Get only active modules for a connector type (for automation wizard).
 */
export async function getActiveModules(
  connectorType: ConnectorType,
): Promise<ActionResult<ModuleManifestSummary[]>> {
  const result = await getModuleManifests(connectorType);
  if (!result.success || !result.data) return result;

  const active = result.data.filter((m) => m.status === ModuleStatus.ACTIVE);
  return { success: true, data: active };
}

// =============================================================================
// Activation / Deactivation (Allium spec rules: ModuleActivation, ModuleDeactivation)
// =============================================================================

export async function activateModule(
  moduleId: string,
): Promise<ActionResult<{ moduleId: string; status: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const registered = moduleRegistry.get(moduleId);
    if (!registered) {
      return { success: false, message: `Module "${moduleId}" not found` };
    }

    if (registered.status === ModuleStatus.ACTIVE) {
      return { success: true, data: { moduleId, status: ModuleStatus.ACTIVE } };
    }

    // Update in-memory registry
    moduleRegistry.setStatus(moduleId, ModuleStatus.ACTIVE);

    // Persist to DB
    await prisma.moduleRegistration.upsert({
      where: { moduleId },
      update: {
        status: ModuleStatus.ACTIVE,
        activatedAt: new Date(),
        deactivatedAt: null,
      },
      create: {
        moduleId,
        connectorType: registered.manifest.connectorType,
        status: ModuleStatus.ACTIVE,
        activatedAt: new Date(),
      },
    });

    return { success: true, data: { moduleId, status: ModuleStatus.ACTIVE } };
  } catch (error) {
    return handleError(error, "Failed to activate module");
  }
}

export async function deactivateModule(
  moduleId: string,
): Promise<
  ActionResult<{
    moduleId: string;
    status: string;
    pausedAutomations: number;
  }>
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const registered = moduleRegistry.get(moduleId);
    if (!registered) {
      return { success: false, message: `Module "${moduleId}" not found` };
    }

    if (registered.status === ModuleStatus.INACTIVE) {
      return {
        success: true,
        data: { moduleId, status: ModuleStatus.INACTIVE, pausedAutomations: 0 },
      };
    }

    // Update in-memory registry
    moduleRegistry.setStatus(moduleId, ModuleStatus.INACTIVE);

    // Persist module status to DB
    await prisma.moduleRegistration.upsert({
      where: { moduleId },
      update: {
        status: ModuleStatus.INACTIVE,
        deactivatedAt: new Date(),
      },
      create: {
        moduleId,
        connectorType: registered.manifest.connectorType,
        status: ModuleStatus.INACTIVE,
        deactivatedAt: new Date(),
      },
    });

    // Pause affected automations (Allium spec rule: ModuleDeactivation)
    const pauseResult = await prisma.automation.updateMany({
      where: {
        userId: user.id,
        jobBoard: moduleId,
        status: "active",
      },
      data: {
        status: "paused",
        pauseReason: "module_deactivated",
      },
    });

    // Create persistent notifications for paused automations
    if (pauseResult.count > 0) {
      try {
        const pausedAutomations = await prisma.automation.findMany({
          where: {
            userId: user.id,
            jobBoard: moduleId,
            status: "paused",
            pauseReason: "module_deactivated",
          },
          select: { id: true, name: true },
        });
        for (const auto of pausedAutomations) {
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: "module_deactivated",
              message: `Automation "${auto.name}" paused because module "${moduleId}" was deactivated.`,
              moduleId,
              automationId: auto.id,
            },
          });
        }
      } catch {
        // best-effort — don't let notification failure block deactivation
      }
    }

    return {
      success: true,
      data: {
        moduleId,
        status: ModuleStatus.INACTIVE,
        pausedAutomations: pauseResult.count,
      },
    };
  } catch (error) {
    return handleError(error, "Failed to deactivate module");
  }
}

// =============================================================================
// DB Sync
// =============================================================================

let dbSynced = false;

/**
 * Sync in-memory registry status from DB (idempotent, runs once per process).
 * Called lazily on first manifest query.
 */
async function syncRegistryFromDb(): Promise<void> {
  if (dbSynced) return;

  try {
    const dbModules = await prisma.moduleRegistration.findMany();
    for (const row of dbModules) {
      const status =
        row.status === "active"
          ? ModuleStatus.ACTIVE
          : row.status === "inactive"
            ? ModuleStatus.INACTIVE
            : ModuleStatus.ERROR;
      moduleRegistry.setStatus(row.moduleId, status);
    }
    dbSynced = true;
  } catch {
    // DB not available — use in-memory defaults (all active)
  }
}

// =============================================================================
// Health Monitoring (Allium spec rule: HealthCheckExecution)
// =============================================================================

export async function runHealthCheck(
  moduleId: string,
): Promise<
  ActionResult<{
    moduleId: string;
    healthStatus: string;
    success: boolean;
    responseTimeMs: number;
    error?: string;
  }>
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const result = await checkModuleHealth(moduleId);

    return {
      success: true,
      data: {
        moduleId: result.moduleId,
        healthStatus: result.healthStatus,
        success: result.success,
        responseTimeMs: result.responseTimeMs,
        error: result.error,
      },
    };
  } catch (error) {
    return handleError(error, "Failed to run health check");
  }
}
