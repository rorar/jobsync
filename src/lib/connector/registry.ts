/**
 * Unified Module Registry — single source of truth for all connector modules.
 *
 * Replaces the separate ConnectorRegistry and AIProviderRegistry with a
 * single registry that stores ModuleManifest metadata alongside factories.
 * The old registries become thin facades delegating to this one.
 *
 * See: specs/module-lifecycle.allium, rule ModuleRegistration
 */

import type { DataSourceConnector } from "./job-discovery/types";
import type { AIProviderConnector } from "./ai-provider/types";
import type { DataEnrichmentConnector } from "./data-enrichment/types";
import {
  ConnectorType,
  ModuleStatus,
  HealthStatus,
  CircuitBreakerState,
  type ModuleManifest,
  type RegisteredModule,
} from "./manifest";

type AnyConnector = DataSourceConnector | AIProviderConnector | DataEnrichmentConnector;

/**
 * Factory type is intentionally loose — module factories have heterogeneous
 * signatures (some accept credentials, others don't). Type safety is enforced
 * at the call site via the facade registries, not at the storage level.
 *
 * Using `(...args: unknown[]) => unknown` instead of `Function` because:
 * 1. `Function` accepts absolutely anything including non-callables
 * 2. The `unknown` return forces an explicit cast in `create()`
 * 3. Runtime validation in `create()` ensures a valid connector is returned
 *
 * We cannot use `(...args: unknown[]) => AnyConnector` because TypeScript
 * parameter contravariance makes `(credential?: string) => DataSourceConnector`
 * incompatible with `(...args: unknown[]) => AnyConnector`.
 */
type ConnectorFactory = (...args: never[]) => unknown;

interface RegistryEntry {
  registered: RegisteredModule;
  factory: ConnectorFactory;
}

class ModuleRegistry {
  private entries = new Map<string, RegistryEntry>();

  /**
   * Register a module with its manifest and factory.
   * Idempotent — re-registration is a no-op (safe for HMR).
   */
  register(manifest: ModuleManifest, factory: ConnectorFactory): void {
    if (this.entries.has(manifest.id)) return;

    const registered: RegisteredModule = {
      manifest,
      status: ModuleStatus.ACTIVE,
      healthStatus: HealthStatus.UNKNOWN,
      circuitBreakerState: CircuitBreakerState.CLOSED,
      consecutiveFailures: 0,
    };

    this.entries.set(manifest.id, { registered, factory });
  }

  get(moduleId: string): RegisteredModule | undefined {
    return this.entries.get(moduleId)?.registered;
  }

  getByType(connectorType: ConnectorType): RegisteredModule[] {
    return [...this.entries.values()]
      .filter((e) => e.registered.manifest.connectorType === connectorType)
      .map((e) => e.registered);
  }

  getActive(connectorType: ConnectorType): RegisteredModule[] {
    return this.getByType(connectorType).filter(
      (m) => m.status === ModuleStatus.ACTIVE,
    );
  }

  create(moduleId: string, ...args: unknown[]): AnyConnector {
    const entry = this.entries.get(moduleId);
    if (!entry) {
      throw new Error(
        `Unknown module: "${moduleId}". Available: ${[...this.entries.keys()].join(", ")}`,
      );
    }
    const result = (entry.factory as (...a: unknown[]) => unknown)(...args);
    if (!result || typeof result !== "object") {
      throw new Error(
        `Factory for "${moduleId}" did not return a valid connector`,
      );
    }
    return result as AnyConnector;
  }

  /** Update a module's status in the in-memory registry */
  setStatus(moduleId: string, status: ModuleStatus): boolean {
    const entry = this.entries.get(moduleId);
    if (!entry) return false;
    entry.registered.status = status;
    if (status === ModuleStatus.ACTIVE) {
      entry.registered.activatedAt = new Date();
    }
    return true;
  }

  /**
   * Update a module's health state in the in-memory registry.
   * Encapsulates mutation so external code does not need direct field access.
   */
  updateHealth(
    moduleId: string,
    healthStatus: HealthStatus,
    lastCheck: Date,
    lastSuccess?: Date,
    consecutiveFailures?: number,
  ): boolean {
    const entry = this.entries.get(moduleId);
    if (!entry) return false;
    entry.registered.healthStatus = healthStatus;
    entry.registered.lastHealthCheck = lastCheck;
    if (lastSuccess) entry.registered.lastSuccessfulConnection = lastSuccess;
    if (consecutiveFailures !== undefined) entry.registered.consecutiveFailures = consecutiveFailures;
    return true;
  }

  /**
   * Update a module's circuit breaker failure tracking in the in-memory registry.
   * Encapsulates mutation so external code does not need direct field access.
   */
  updateCircuitBreaker(
    moduleId: string,
    consecutiveFailures: number,
    circuitBreakerState?: CircuitBreakerState,
    circuitBreakerOpenSince?: Date | null,
  ): boolean {
    const entry = this.entries.get(moduleId);
    if (!entry) return false;
    entry.registered.consecutiveFailures = consecutiveFailures;
    if (circuitBreakerState !== undefined) {
      entry.registered.circuitBreakerState = circuitBreakerState;
    }
    if (circuitBreakerOpenSince !== undefined) {
      entry.registered.circuitBreakerOpenSince = circuitBreakerOpenSince ?? undefined;
    }
    return true;
  }

  /**
   * Look up a registered module by its credential.moduleId (the ApiKey table key).
   * This differs from get() which looks up by manifest.id.
   * Example: manifest.id="jsearch" has credential.moduleId="rapidapi".
   */
  getByCredentialModuleId(credentialModuleId: string): RegisteredModule | undefined {
    for (const entry of this.entries.values()) {
      if (entry.registered.manifest.credential.moduleId === credentialModuleId) {
        return entry.registered;
      }
    }
    return undefined;
  }

  has(moduleId: string): boolean {
    return this.entries.has(moduleId);
  }

  availableModules(): string[] {
    return [...this.entries.keys()];
  }
}

export const moduleRegistry = new ModuleRegistry();
