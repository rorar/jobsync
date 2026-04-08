/**
 * Reference Data — Module Registration Barrel
 *
 * Imports and registers all reference data modules with the unified ModuleRegistry.
 * This file is imported once at startup.
 */

import { moduleRegistry } from "../registry";

import { escoClassificationManifest } from "./modules/esco-classification/manifest";
import { createEscoClassificationModule } from "./modules/esco-classification";
import { eurostatNutsManifest } from "./modules/eurostat-nuts/manifest";
import { createEurostatNutsModule } from "./modules/eurostat-nuts";

moduleRegistry.register(escoClassificationManifest, createEscoClassificationModule);
moduleRegistry.register(eurostatNutsManifest, createEurostatNutsModule);
