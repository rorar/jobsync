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
import {
  ConnectorType,
  ModuleStatus,
  HealthStatus,
  CircuitBreakerState,
  type ModuleManifest,
  type RegisteredModule,
} from "./manifest";

type AnyConnector = DataSourceConnector | AIProviderConnector;
type ConnectorFactory = Function;

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
    return entry.factory(...args) as AnyConnector;
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

  has(moduleId: string): boolean {
    return this.entries.has(moduleId);
  }

  availableModules(): string[] {
    return [...this.entries.keys()];
  }
}

export const moduleRegistry = new ModuleRegistry();
