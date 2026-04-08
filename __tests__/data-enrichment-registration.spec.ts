/**
 * Module Registration Tests
 *
 * Verifies that importing the connectors barrels registers all modules
 * into the unified ModuleRegistry with the expected metadata.
 */

// Import register-all to trigger all module self-registrations as side-effects
import "@/lib/connector/register-all";

import { moduleRegistry } from "@/lib/connector/registry";
import { ConnectorType } from "@/lib/connector/manifest";

describe("Data Enrichment — connectors barrel registration", () => {
  describe("existing enrichment modules", () => {
    it("logo_dev is registered", () => {
      expect(moduleRegistry.has("logo_dev")).toBe(true);
    });

    it("google_favicon is registered", () => {
      expect(moduleRegistry.has("google_favicon")).toBe(true);
    });

    it("meta_parser is registered", () => {
      expect(moduleRegistry.has("meta_parser")).toBe(true);
    });
  });
});

describe("Reference Data — connectors barrel registration", () => {
  describe("esco_classification module", () => {
    it("is registered in the module registry", () => {
      expect(moduleRegistry.has("esco_classification")).toBe(true);
    });

    it("has connectorType REFERENCE_DATA", () => {
      const registered = moduleRegistry.get("esco_classification");
      expect(registered?.manifest.connectorType).toBe(ConnectorType.REFERENCE_DATA);
    });

    it("manifest id matches the registry key", () => {
      const registered = moduleRegistry.get("esco_classification");
      expect(registered?.manifest.id).toBe("esco_classification");
    });
  });

  describe("eurostat_nuts module", () => {
    it("is registered in the module registry", () => {
      expect(moduleRegistry.has("eurostat_nuts")).toBe(true);
    });

    it("has connectorType REFERENCE_DATA", () => {
      const registered = moduleRegistry.get("eurostat_nuts");
      expect(registered?.manifest.connectorType).toBe(ConnectorType.REFERENCE_DATA);
    });

    it("manifest id matches the registry key", () => {
      const registered = moduleRegistry.get("eurostat_nuts");
      expect(registered?.manifest.id).toBe("eurostat_nuts");
    });
  });
});
