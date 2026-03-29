import { moduleRegistry } from "../registry";
import { connectorRegistry } from "./registry";

// Import manifests + factories
import { euresManifest } from "./modules/eures/manifest";
import { createEuresConnector } from "./modules/eures";
import { arbeitsagenturManifest } from "./modules/arbeitsagentur/manifest";
import { createArbeitsagenturConnector } from "./modules/arbeitsagentur";
import { jsearchManifest } from "./modules/jsearch/manifest";
import { createJSearchConnector } from "./modules/jsearch";

// Register with unified registry
moduleRegistry.register(euresManifest, createEuresConnector);
moduleRegistry.register(arbeitsagenturManifest, createArbeitsagenturConnector);
moduleRegistry.register(jsearchManifest, createJSearchConnector);

export { connectorRegistry };
