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
  if (!user) return { success: false, message: "errors.notAuthenticated" };

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
    if (!user) return { success: false, message: "errors.notAuthenticated" };

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
        message: "errors.notAuthorized",
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
      return { success: false, message: "automations.moduleNotFound" };
    }

    if (registered.status === ModuleStatus.ACTIVE) {
      // MOD-B1, second half — the symmetric twin of the check in
      // `deactivateModule` below. The ordering fix further down closes the case
      // where OUR write failed; it does not close the case where memory was
      // never right to begin with.
      //
      // `syncRegistryFromDb` latches on `dbSynced` (`:477`) and therefore reads
      // `ModuleRegistration` exactly ONCE per process, and that table is
      // deployment-global — no `userId` column (`prisma/schema.prisma:602`). So
      // any change made outside this process, by another instance or by hand,
      // is invisible here for the rest of the process lifetime. Memory then
      // says ACTIVE while the row says `inactive`, this short-circuit engages,
      // and the caller is told `success: true` for a write that never happened
      // — "silent success over a lost write", the exact shape MOD-B1 names,
      // left standing in the twin function.
      //
      // An ABSENT row AGREES here, unlike in `deactivateModule`: the schema
      // default is `active` (`prisma/schema.prisma:606`), so nothing needs
      // writing. If this read throws we deliberately do not catch it — the
      // outer handler returns `success: false` rather than guessing.
      const persisted = await prisma.moduleRegistration.findUnique({
        where: { moduleId },
        select: { status: true },
      });

      if (!persisted || persisted.status === ModuleStatus.ACTIVE) {
        return {
          success: true,
          data: { moduleId, status: ModuleStatus.ACTIVE },
        };
      }

      // Memory-only ACTIVE — fall through and repair the record. The write path
      // below is idempotent: the upsert asserts the same status in both
      // branches and `setStatus` is a no-op for the value memory already holds.
      console.warn(
        `[activateModule] Module "${moduleId}" is ACTIVE in memory but ` +
          `"${persisted.status}" in the database — re-running the activation ` +
          `to repair the record.`,
      );
    }

    // Guard: reject activation if credential is required but not configured
    // Spec rule ModuleActivation requires: module.is_configured
    // is_configured = credential.type = none OR defaultValue != null OR env fallback set OR DB row exists
    if (registered.manifest.credential.required) {
      const cred = registered.manifest.credential;
      const hasDefault = !!cred.defaultValue;
      const hasEnv = !!cred.envFallback && !!process.env[cred.envFallback];
      const hasDbKey = await prisma.apiKey.findFirst({
        where: { moduleId: cred.moduleId },
        select: { id: true },
      });
      if (!hasDefault && !hasEnv && !hasDbKey) {
        return {
          success: false,
          message: "settings.moduleActivationRequiresCredential",
        };
      }
    }

    // MOD-B1 (symmetric twin of the deactivateModule ordering below): persist
    // FIRST, then mirror into the in-memory registry. With the old order a
    // rejected write left memory asserting ACTIVE while the database still said
    // inactive, and the `registered.status === ACTIVE` short-circuit above then
    // returned success on every retry without writing. Persisting first leaves
    // memory untouched on failure, so the short-circuit does not engage and the
    // next call retries.
    //
    // That argument is sound for a write WE lost, and it was once given as the
    // reason the activate path needs no DB read. It does not cover memory that
    // was never right — a per-process registry against a deployment-global
    // table — which is why the short-circuit above now confirms against the
    // row. Two different ways to be wrong, two guards.
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

    // Only now mirror the persisted state into the in-memory registry.
    moduleRegistry.setStatus(moduleId, ModuleStatus.ACTIVE);

    // Emit ModuleReactivated domain event per distinct affected user
    // (Sprint 2 H-A-01: close the symmetric twin of Sprint 1 CRIT-A1 — the
    // handler `notification-dispatcher.handleModuleReactivated` was already
    // wired and registered, but no publisher existed, so users never received
    // the "module back online" notification).
    //
    // Pattern mirrors deactivateModule: query the set of automations that
    // this module left paused (pauseReason = "module_deactivated"), group
    // by userId, and emit ONE ModuleReactivated event per distinct user.
    // The dispatcher then writes a single per-user summary notification
    // ("Module X reactivated. Y automation(s) remain paused") through the
    // channel router — in-app + webhook + email + push, gated by each
    // user's preferences. Reactivation intentionally does NOT auto-resume
    // the paused automations (see CLAUDE.md — "user must manually reactivate").
    //
    // Best-effort: if the lookup or emission fails, log and continue —
    // the authoritative module activation DB write has already succeeded
    // above, so returning a failure to the admin would be misleading.
    try {
      const pausedByModule = await prisma.automation.findMany({
        where: {
          jobBoard: moduleId,
          status: "paused",
          pauseReason: "module_deactivated",
        },
        select: { id: true, userId: true },
      });

      if (pausedByModule.length > 0) {
        const countsByUser = new Map<string, number>();
        for (const auto of pausedByModule) {
          countsByUser.set(auto.userId, (countsByUser.get(auto.userId) ?? 0) + 1);
        }
        for (const [userId, pausedAutomationCount] of countsByUser) {
          emitEvent(
            createEvent(DomainEventTypes.ModuleReactivated, {
              moduleId,
              // Sprint 3 M-A-02: carry the human-readable manifest name so
              // consumers can render `titleParams.moduleName` without a
              // registry round-trip (the registry is in-memory and may be
              // stale cross-process; the payload is the authoritative snapshot).
              moduleName: registered.manifest.name,
              userId,
              pausedAutomationCount,
            }),
          );
        }
      }
    } catch (notifyErr) {
      console.warn(
        `[activateModule] Failed to emit ModuleReactivated events for "${moduleId}":`,
        notifyErr,
      );
    }

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
    if (!user) return { success: false, message: "errors.notAuthenticated" };

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
        message: "errors.notAuthorized",
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
      return { success: false, message: "automations.moduleNotFound" };
    }

    if (registered.status === ModuleStatus.INACTIVE) {
      // MOD-B1: the in-memory registry is per-process and can disagree with the
      // database. Short-circuiting on memory ALONE made that disagreement
      // permanent: a call whose write failed left memory INACTIVE, and every
      // retry then answered `success: true` without attempting the write again.
      // The only recovery was activate-then-deactivate, which nobody would guess.
      //
      // So the short-circuit now requires the DATABASE to agree. An ABSENT row
      // does NOT agree: per ADR-043/ADR-044 absence means the schema default
      // `active`, so a missing row must fall through and be written. If this
      // read itself throws we deliberately do not catch it — the outer handler
      // returns `success: false` rather than guessing.
      const persisted = await prisma.moduleRegistration.findUnique({
        where: { moduleId },
        select: { status: true },
      });

      if (persisted?.status === ModuleStatus.INACTIVE) {
        return {
          success: true,
          data: { moduleId, status: ModuleStatus.INACTIVE, pausedAutomations: 0 },
        };
      }

      // Memory-only INACTIVE — fall through and repair the record. The write
      // path below is idempotent: `setStatus` is a no-op for the value memory
      // already holds, the upsert asserts the same status in both branches, and
      // the automation query filters on `status: "active"` so automations paused
      // by the earlier attempt are not touched twice.
      console.warn(
        `[deactivateModule] Module "${moduleId}" is INACTIVE in memory but ` +
          `${persisted ? `"${persisted.status}"` : "absent"} in the database — ` +
          `re-running the deactivation to repair the record.`,
      );
    }

    // MOD-B1: persist FIRST, then mirror into the in-memory registry.
    // The old order mutated memory here and persisted second, so a rejected
    // write left this process asserting INACTIVE while the database still said
    // active — and the early return above then reported success forever.
    // Persisting first means a failed write throws to the outer catch, returns
    // `success: false`, and leaves memory untouched, so the next call retries.
    //
    // MOD-B1 residual, closed 2026-09-05: ordering alone only ever covered a
    // failure of the FIRST statement. The status write and the pause cascade now
    // commit together or not at all, because the partial state was worse than
    // either whole one AND was self-concealing: the row said inactive, memory
    // said INACTIVE, the two agreed — so the short-circuit above took the
    // agreement at face value and every retry returned `success: true` with
    // `pausedAutomations: 0`, while the automations it claimed to have paused
    // kept running. A rollback cannot produce that agreement: the row stays
    // `active`, memory is never touched (the mirror is below the commit), and
    // the next call re-runs the whole cascade.
    //
    // Cross-user by design (CLAUDE.md § Cross-User Degradation) — the cascade
    // spans every tenant's automations for this module, which argues FOR
    // all-or-nothing, not against it: a half-applied cascade pauses an arbitrary
    // subset of tenants with nothing recording which. SQLite serializes writers
    // at the database file, not per row or per tenant, so this is the same three
    // statements under one write lock instead of two.
    //
    // Nothing that is not a database write belongs inside. The in-memory mirror
    // and the ModuleDeactivated events are below, AFTER the commit — an event
    // published from inside would announce a pause that may still roll back, and
    // its consumers write through the non-transactional client into a database
    // this transaction is still holding open.
    const affectedAutomations = await prisma.$transaction(async (tx) => {
      await tx.moduleRegistration.upsert({
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
      const affected = await tx.automation.findMany({
        where: {
          jobBoard: moduleId,
          status: "active",
        },
        select: { id: true, name: true, userId: true },
      });

      if (affected.length > 0) {
        // Update by the specific IDs we captured (no TOCTOU)
        await tx.automation.updateMany({
          where: { id: { in: affected.map((a) => a.id) } },
          data: {
            status: "paused",
            pauseReason: "module_deactivated",
          },
        });
      }

      return affected;
    });

    // Committed. Only now mirror the persisted state into the in-memory registry.
    moduleRegistry.setStatus(moduleId, ModuleStatus.INACTIVE);

    if (affectedAutomations.length > 0) {
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
            // Sprint 3 M-A-02: see ModuleReactivated emit site above.
            moduleName: registered.manifest.name,
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

/**
 * Run a health check for the given module.
 *
 * Sprint 3 Stream C — Admin Gate Audit (confirmed-safe, no gate required):
 * -------------------------------------------------------------------------
 * The CRIT-S-04 hotfix intentionally excluded `runHealthCheck` from the
 * `authorizeAdminAction()` gate. Sprint 3 Stream C audited the full call
 * chain of `checkModuleHealth` in `src/lib/connector/health-monitor.ts`
 * and confirmed the following:
 *
 * 1. `moduleRegistry.updateHealth(moduleId, newHealthStatus, ...)` — writes
 *    ONLY health-status fields (HEALTHY / DEGRADED / UNREACHABLE). It does
 *    NOT call `moduleRegistry.setStatus()` and does NOT change the module's
 *    activation state (ACTIVE / INACTIVE).
 *
 * 2. `prisma.moduleRegistration.upsert({ update: { healthStatus, updatedAt } })`
 *    — writes ONLY `healthStatus` and `updatedAt`. The `status` column
 *    (active/inactive) is never touched by the health-monitor path.
 *
 *    CORRECTION (2026-09-02, ADR-044): point 2 was ASPIRATIONAL until
 *    `f56da9ff`. It quotes the `update` branch correctly and then generalises
 *    to "the health-monitor path", but the upsert has two branches, and its
 *    `create` branch wrote `status: registered.status` from `32426cca` until
 *    `f56da9ff` — five months. It is true as written now. The Sprint 3
 *    CONCLUSION was unaffected: the create branch fires only when no row
 *    exists, so there was never a recorded lifecycle value for a non-admin
 *    caller to overwrite.
 *
 * 3. Neither write cascades into pausing any user's automations.
 *    The automation-pause cascade is exclusively triggered by
 *    `handleAuthFailure`, `handleCircuitBreakerTrip`, and `deactivateModule`
 *    — NOT by health check outcomes.
 *
 * Conclusion: `runHealthCheck` is CONFIRMED SAFE without an admin gate. The
 * per-user rate limit (`checkHealthCheckRateLimit`) is the appropriate control.
 * The critical distinction from CRIT-S-04:
 *   - activateModule / deactivateModule → mutate module.status (ACTIVE/INACTIVE)
 *     → cascade-pause every user's automations (cross-tenant write)
 *   - runHealthCheck → mutate module.healthStatus (HEALTHY/DEGRADED/UNREACHABLE)
 *     → zero automation cascade, informational only
 *
 * See: docs/BUGS.md (Sprint 1.5 open follow-up now closed),
 *      specs/module-lifecycle.allium invariant AdminOnlyModuleLifecycle
 *      (does NOT list runHealthCheck as an enforcement site — by design).
 */
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
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const rateCheck = checkHealthCheckRateLimit(user.id);
    if (!rateCheck.allowed) {
      return { success: false, message: "errors.tooManyRequests" };
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
