/**
 * Module Lifecycle Manager — Type Definitions
 *
 * Derived from specs/module-lifecycle.allium.
 * These types define the Published Language (DDD) between the Connector
 * domain boundary and its Module implementations.
 */

import type { CachePolicy } from "./cache";

// =============================================================================
// Enums
// =============================================================================

export enum ConnectorType {
  JOB_DISCOVERY = "job_discovery",
  AI_PROVIDER = "ai_provider",
  DATA_ENRICHMENT = "data_enrichment",
  REFERENCE_DATA = "reference_data",
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

// AutomationPauseReason is defined in @/models/automation.model (canonical location per DDD —
// it belongs to the Automation aggregate). Import from there if needed.

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
// ConnectorParams Schema (Array-based, deterministic ordering)
// =============================================================================

export interface ConnectorParamField {
  key: string;
  type: "string" | "number" | "boolean" | "select" | "multiselect";
  label: string; // i18n key (e.g. "automations.params.umkreis")
  defaultValue?: string | number | boolean;
  options?: (string | number)[]; // for select/multiselect types
  required?: boolean;
  min?: number; // for number type
  max?: number; // for number type
  placeholder?: string;
}

export type ConnectorParamsSchema = ConnectorParamField[];

export interface SearchFieldOverride {
  field: "keywords" | "location";
  widgetId: string; // e.g. "eures-occupation", "eures-location"
}

// =============================================================================
// Dependency Health Checks
// =============================================================================

export interface DependencyHealthCheck {
  /** Stable identifier (e.g. "esco_classification") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Health probe URL (absolute) */
  endpoint: string;
  /** Probe timeout in milliseconds */
  timeoutMs: number;
  /** true = module cannot function without it, false = degraded mode */
  required: boolean;
  /** Human-readable purpose (e.g. "Occupation search in Automation Wizard") */
  usedFor: string;
}

// =============================================================================
// Contracts (Published Language)
// =============================================================================

export interface ModuleManifest {
  id: string;
  name: string;
  manifestVersion: number;
  connectorType: ConnectorType;
  credential: CredentialRequirement;
  settingsSchema?: SettingsSchema;
  healthCheck?: HealthCheckConfig;
  resilience?: ResilienceConfig;
  /** Response caching policy (Stufe 1). If omitted, no caching. */
  cachePolicy?: CachePolicy;
  /** External services this module depends on. Health-checked alongside the module. */
  dependencies?: DependencyHealthCheck[];
}

export interface JobDiscoveryManifest extends ModuleManifest {
  connectorType: ConnectorType.JOB_DISCOVERY;
  automationType?: "discovery" | "maintenance";
  connectorParamsSchema?: ConnectorParamsSchema;
  searchFieldOverrides?: SearchFieldOverride[];
}

export interface AiManifest extends ModuleManifest {
  connectorType: ConnectorType.AI_PROVIDER;
  modelSelection: ModelSelectionConfig;
}

export interface DataEnrichmentManifest extends ModuleManifest {
  connectorType: ConnectorType.DATA_ENRICHMENT;
  supportedDimensions: string[];
}

export interface ReferenceDataManifest extends ModuleManifest {
  connectorType: ConnectorType.REFERENCE_DATA;
  /** Which taxonomy this module provides (e.g. "esco_occupations", "nuts_regions") */
  taxonomy: string;
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
