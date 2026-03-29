/**
 * Module Lifecycle Manager — Type Definitions
 *
 * Derived from specs/module-lifecycle.allium.
 * These types define the Published Language (DDD) between the Connector
 * domain boundary and its Module implementations.
 */

// =============================================================================
// Enums
// =============================================================================

export enum ConnectorType {
  JOB_DISCOVERY = "job_discovery",
  AI_PROVIDER = "ai_provider",
}

export enum ModuleStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  ERROR = "error",
}

export enum HealthStatus {
  UNKNOWN = "unknown",
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  UNREACHABLE = "unreachable",
}

export enum CredentialType {
  API_KEY = "api_key",
  ENDPOINT_URL = "endpoint_url",
  NONE = "none",
}

export enum CircuitBreakerState {
  CLOSED = "closed",
  OPEN = "open",
  HALF_OPEN = "half_open",
}

export enum AutomationPauseReason {
  MODULE_DEACTIVATED = "module_deactivated",
  AUTH_FAILURE = "auth_failure",
  CONSECUTIVE_FAILURES = "consecutive_failures",
  CB_ESCALATION = "cb_escalation",
}

// =============================================================================
// Value Types (Settings Declaration)
// =============================================================================

export interface CredentialRequirement {
  type: CredentialType;
  /** Must match the moduleId used in ApiKey table (e.g. "openai", "rapidapi") */
  moduleId: string;
  required: boolean;
  /** Environment variable fallback (e.g. "OPENAI_API_KEY") */
  envFallback?: string;
  /** Default value when no credential is provided (e.g. Ollama localhost URL) */
  defaultValue?: string;
  /** Whether to mask the value in UI (false for URLs like Ollama) */
  sensitive: boolean;
  /** UI placeholder text (e.g. "sk-...", "http://127.0.0.1:11434") */
  placeholder?: string;
}

export interface SettingsField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  defaultValue?: unknown;
  options?: string[];
  validation?: string;
}

export interface SettingsSchema {
  fields: SettingsField[];
}

export interface HealthCheckConfig {
  endpoint?: string;
  timeoutMs: number;
  intervalMs: number;
}

export interface ResilienceConfig {
  retryAttempts: number;
  retryBackoff: "exponential" | "linear" | "none";
  circuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownMs: number;
  timeoutMs: number;
  rateLimitTokens?: number;
  rateLimitRefillMs?: number;
  maxConcurrent?: number;
}

export interface ModelSelectionConfig {
  defaultModel?: string;
  listEndpoint?: string;
}

// =============================================================================
// Contracts (Published Language)
// =============================================================================

export interface ModuleManifest {
  id: string;
  name: string;
  connectorType: ConnectorType;
  credential: CredentialRequirement;
  settingsSchema?: SettingsSchema;
  healthCheck?: HealthCheckConfig;
  resilience?: ResilienceConfig;
}

export interface JobDiscoveryManifest extends ModuleManifest {
  connectorType: ConnectorType.JOB_DISCOVERY;
  connectorParamsSchema?: Record<string, unknown>;
}

export interface AiManifest extends ModuleManifest {
  connectorType: ConnectorType.AI_PROVIDER;
  modelSelection: ModelSelectionConfig;
}

// =============================================================================
// Entities
// =============================================================================

export interface RegisteredModule<M extends ModuleManifest = ModuleManifest> {
  manifest: M;
  status: ModuleStatus;
  healthStatus: HealthStatus;
  lastHealthCheck?: Date;
  lastSuccessfulConnection?: Date;
  activatedAt?: Date;
  circuitBreakerState: CircuitBreakerState;
  consecutiveFailures: number;
  circuitBreakerOpenSince?: Date;
}

export interface ConnectorGroup {
  type: ConnectorType;
  modules: RegisteredModule[];
  /** Derived: active when at least one module is active */
  readonly isActive: boolean;
}
