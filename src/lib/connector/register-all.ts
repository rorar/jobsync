import "server-only";

/**
 * Central Module Registration — imports all modules to trigger self-registration.
 *
 * IMPORTANT: This file MUST be imported synchronously (not via dynamic import)
 * in every entry point that queries the ModuleRegistry (module.actions.ts,
 * runner.ts, providers.ts). Modules must be registered before the first
 * facade query (enrichmentConnectorRegistry, connectorRegistry, etc.).
 *
 * Replaces the per-connector barrel files (connectors.ts).
 * Each import triggers the module's self-registration side effect.
 */

// Job Discovery
import "./job-discovery/modules/eures";
import "./job-discovery/modules/arbeitsagentur";
import "./job-discovery/modules/jsearch";

// AI Provider
import "./ai-provider/modules/ollama";
import "./ai-provider/modules/openai";
import "./ai-provider/modules/deepseek";

// Data Enrichment
import "./data-enrichment/modules/logo-dev";
import "./data-enrichment/modules/google-favicon";
import "./data-enrichment/modules/meta-parser";

// Reference Data
import "./reference-data/modules/esco-classification";
import "./reference-data/modules/eurostat-nuts";
