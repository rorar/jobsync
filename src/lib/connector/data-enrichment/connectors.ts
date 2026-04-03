/**
 * Data Enrichment — Module Registration Barrel
 *
 * Imports and registers all enrichment modules with the unified ModuleRegistry.
 * Each module's manifest + factory is registered here.
 * This file is imported once at startup.
 *
 * New modules: add an import line below. No other changes needed.
 *
 * Note: Module implementations are created by a separate agent.
 * Uncomment imports as modules become available:
 *
 * import "./modules/clearbit";
 * import "./modules/google-favicon";
 * import "./modules/meta-parser";
 */

import { enrichmentConnectorRegistry } from "./registry";

export { enrichmentConnectorRegistry };
