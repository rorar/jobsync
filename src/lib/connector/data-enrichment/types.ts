import type { EnrichmentResult, EnrichmentLog } from "@prisma/client";

// ==========================================
// Enumerations (application-level, SQLite has no enums)
// ==========================================

export const ENRICHMENT_DIMENSIONS = ["logo", "deep_link"] as const;
export type EnrichmentDimension = (typeof ENRICHMENT_DIMENSIONS)[number];

export const FUTURE_ENRICHMENT_DIMENSIONS = [
  "review", "contact", "salary", "company_profile"
] as const;

export const CACHE_STATUSES = ["fresh", "stale", "expired", "not_found", "error"] as const;
export type CacheStatus = (typeof CACHE_STATUSES)[number];

export const ENRICHMENT_OUTCOMES = [
  "success", "not_found", "error", "timeout", "skipped"
] as const;
export type EnrichmentOutcome = (typeof ENRICHMENT_OUTCOMES)[number];

export const ENRICHMENT_TRIGGERS = [
  "company_created", "job_imported", "manual", "link_pasted", "scheduled"
] as const;
export type EnrichmentTrigger = (typeof ENRICHMENT_TRIGGERS)[number];

// ==========================================
// Module Interface
// ==========================================

export interface EnrichmentInput {
  dimension: EnrichmentDimension;
  companyDomain?: string;   // For logo dimension
  url?: string;             // For deep_link dimension
  companyName?: string;     // For review, contact (future)
  jobDescription?: string;  // For contact extraction (future)
  region?: string;          // For salary (future)
}

export interface EnrichmentOutput {
  dimension: EnrichmentDimension;
  status: "found" | "not_found" | "error";
  data: Record<string, unknown>;
  source: string;  // Module ID
  ttl: number;     // TTL in seconds
}

export interface DataEnrichmentConnector {
  enrich(input: EnrichmentInput): Promise<EnrichmentOutput>;
}

// ==========================================
// Dimension-Specific Data Types
// ==========================================

export interface LogoData {
  logoUrl: string;
  width?: number;
  height?: number;
  format?: string;
}

export interface DeepLinkData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

// ==========================================
// Fallback Chain Configuration
// ==========================================

export interface FallbackChainEntry {
  moduleId: string;
  priority: number;  // Lower = tried first, 1-based
}

export interface FallbackChainConfig {
  dimension: EnrichmentDimension;
  entries: FallbackChainEntry[];
}

// ==========================================
// Configuration Constants
// ==========================================

export const ENRICHMENT_CONFIG = {
  LOGO_TTL_SECONDS: 30 * 24 * 60 * 60,       // 30 days
  DEEP_LINK_TTL_SECONDS: 7 * 24 * 60 * 60,    // 7 days
  REVIEW_TTL_SECONDS: 24 * 60 * 60,            // 1 day
  STALE_GRACE_PERIOD_SECONDS: 7 * 24 * 60 * 60, // 7 days
  CHAIN_TIMEOUT_MS: 10000,                      // 10 seconds
  MODULE_TIMEOUT_MS: 5000,                      // 5 seconds
  MAX_CONCURRENT_PER_USER: 5,
  PLACEHOLDER_LOGO_PATH: "/images/company-placeholder.svg",
} as const;

// ==========================================
// Manifest Extension
// ==========================================

// DataEnrichmentManifest extends the base ModuleManifest
// Import the base from the shared manifest module
// This will be used by each module's manifest.ts

export interface DataEnrichmentManifestExtension {
  supportedDimensions: EnrichmentDimension[];
}

// ==========================================
// Re-exports for convenience
// ==========================================

export type { EnrichmentResult, EnrichmentLog };
