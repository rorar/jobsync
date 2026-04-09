"use server";

import prisma from "@/lib/db";
import { moduleRegistry } from "@/lib/connector/registry";
import "@/lib/connector/register-all";
import {
  ConnectorType,
  CredentialType,
  HealthStatus,
  ModuleStatus,
  type ConnectorParamsSchema,
  type DependencyHealthCheck,
  type JobDiscoveryManifest,
  type ModuleI18n,
  type SearchFieldOverride,
} from "@/lib/connector/manifest";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { checkModuleHealth } from "@/lib/connector/health-monitor";
import { checkHealthCheckRateLimit } from "@/lib/health-rate-limit";
import { emitEvent, createEvent, DomainEventTypes } from "@/lib/events";
import { authorizeAdminAction } from "@/lib/auth/admin";
import { checkAdminActionRateLimit } from "@/lib/auth/admin-rate-limit";

// =============================================================================
// Types
// =============================================================================

/** Serializable manifest summary for client components */
export interface ModuleManifestSummary {
  moduleId: string;
  name: string;
  manifestVersion: number;
  connectorType: string;
  automationType?: "discovery" | "maintenance";
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
  connectorParamsSchema?: ConnectorParamsSchema;
  searchFieldOverrides?: SearchFieldOverride[];
  dependencies?: DependencyHealthCheck[];
  i18n?: ModuleI18n;
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
        ...moduleRegistry.getByType(ConnectorType.DATA_ENRICHMENT),
        ...moduleRegistry.getByType(ConnectorType.REFERENCE_DATA),
      ];

  // Trigger health checks for unknown-status modules (non-blocking).
  // This ensures the settings page shows fresh health data on first load.
  const unknownModules = modules.filter(
    (m) => m.healthStatus === HealthStatus.UNKNOWN,
  );
  for (const mod of unknownModules) {
    checkModuleHealth(mod.manifest.id).catch((err) => {
      console.error(`[getModuleManifests] Background health check failed for "${mod.manifest.id}":`, err);
    });
  }

  const summaries: ModuleManifestSummary[] = modules.map((m) => {
    // Extract Job Discovery specific fields when applicable
    const jdManifest = m.manifest.connectorType === ConnectorType.JOB_DISCOVERY
      ? (m.manifest as JobDiscoveryManifest)
      : undefined;

    return {
      moduleId: m.manifest.id,
      name: m.manifest.name,
      manifestVersion: m.manifest.manifestVersion,
      connectorType: m.manifest.connectorType,
      automationType: jdManifest?.automationType,
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
      connectorParamsSchema: jdManifest?.connectorParamsSchema,
      searchFieldOverrides: jdManifest?.searchFieldOverrides,
      dependencies: m.manifest.dependencies,
      i18n: m.manifest.i18n,
    };
  });

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

    // Admin authorization — see specs/module-lifecycle.allium invariant
    // `AdminOnlyModuleLifecycle`. Module activation mutates shared singleton
    // state and therefore requires admin tier (CRIT-S-04).
    const authz = await authorizeAdminAction(user, {
      action: "activateModule",
      targetId: moduleId,
    });
    if (!authz.allowed) {
      return {
        success: false,
        message: authz.reason ?? "errors.notAuthorized",
        errorCode: "UNAUTHORIZED",
      };
    }

    const rate = checkAdminActionRateLimit(user.id);
    if (!rate.allowed) {
      return {
        success: false,
        message: "errors.tooManyRequests",
        errorCode: "UNAUTHORIZED",
      };
    }

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
    return handleError(error, "errors.activateModule");
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

    // Admin authorization — see specs/module-lifecycle.allium invariant
    // `AdminOnlyModuleLifecycle`. Module deactivation pauses automations for
    // EVERY user on this deployment, so it is admin-only (CRIT-S-04).
    const authz = await authorizeAdminAction(user, {
      action: "deactivateModule",
      targetId: moduleId,
    });
    if (!authz.allowed) {
      return {
        success: false,
        message: authz.reason ?? "errors.notAuthorized",
        errorCode: "UNAUTHORIZED",
      };
    }

    const rate = checkAdminActionRateLimit(user.id);
    if (!rate.allowed) {
      return {
        success: false,
        message: "errors.tooManyRequests",
        errorCode: "UNAUTHORIZED",
      };
    }

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

    // Query IDs BEFORE update to avoid TOCTOU race — captures the exact set
    // of automations that will be paused, before any concurrent changes.
    // Global scope (all users) — consistent with degradation.ts handlers
    // (handleAuthFailure, handleCircuitBreakerTrip) per Allium spec.
    const affectedAutomations = await prisma.automation.findMany({
      where: {
        jobBoard: moduleId,
        status: "active",
      },
      select: { id: true, name: true, userId: true },
    });

    if (affectedAutomations.length > 0) {
      // Update by the specific IDs we captured (no TOCTOU)
      await prisma.automation.updateMany({
        where: { id: { in: affectedAutomations.map((a) => a.id) } },
        data: {
          status: "paused",
          pauseReason: "module_deactivated",
        },
      });

      // Emit ONE ModuleDeactivated domain event per distinct affected user.
      // The notification-dispatcher consumer (in-app + webhook + email + push
      // channels) is the single writer — see ADR-030 / specs/notification-dispatch.allium
      // (invariants SingleNotificationWriter + LateBoundLocale). The dispatcher
      // resolves the viewer's locale and populates structured titleKey/titleParams
      // so users on non-English locales see correctly localized notifications
      // that re-localize when the user switches language later.
      const automationIdsByUser = new Map<string, string[]>();
      for (const auto of affectedAutomations) {
        const existing = automationIdsByUser.get(auto.userId);
        if (existing) {
          existing.push(auto.id);
        } else {
          automationIdsByUser.set(auto.userId, [auto.id]);
        }
      }
      for (const [userId, automationIds] of automationIdsByUser) {
        emitEvent(
          createEvent(DomainEventTypes.ModuleDeactivated, {
            moduleId,
            userId,
            affectedAutomationIds: automationIds,
          }),
        );
      }
    }

    return {
      success: true,
      data: {
        moduleId,
        status: ModuleStatus.INACTIVE,
        pausedAutomations: affectedAutomations.length,
      },
    };
  } catch (error) {
    return handleError(error, "errors.deactivateModule");
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
  } catch (syncError) {
    console.error("[syncRegistryFromDb] Failed to sync module status from DB — using in-memory defaults:", syncError);
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

    const rateCheck = checkHealthCheckRateLimit(user.id);
    if (!rateCheck.allowed) {
      return { success: false, message: "Too many health checks — please wait a moment" };
    }

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
    return handleError(error, "errors.runHealthCheck");
  }
}
