/**
 * Data Enrichment — Module Registration Barrel
 *
 * Imports and registers all enrichment modules with the unified ModuleRegistry.
 * Each module's manifest + factory is registered here.
 * This file is imported once at startup.
 *
 * New modules: add an import line below. No other changes needed.
 */

import { moduleRegistry } from "../registry";
import { enrichmentConnectorRegistry } from "./registry";

// Import manifests + factories
import { clearbitManifest } from "./modules/clearbit/manifest";
import { createClearbitModule } from "./modules/clearbit";
import { googleFaviconManifest } from "./modules/google-favicon/manifest";
import { createGoogleFaviconModule } from "./modules/google-favicon";
import { metaParserManifest } from "./modules/meta-parser/manifest";
import { createMetaParserModule } from "./modules/meta-parser";

// Register with unified registry
moduleRegistry.register(clearbitManifest, createClearbitModule);
moduleRegistry.register(googleFaviconManifest, createGoogleFaviconModule);
moduleRegistry.register(metaParserManifest, createMetaParserModule);

export { enrichmentConnectorRegistry };
