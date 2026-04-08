/**
 * Eurostat NUTS Manifest — Unit Tests
 *
 * Verifies that eurostatNutsManifest declares the correct identity, credential,
 * and health-check configuration for a health-only reference data module.
 */

import { eurostatNutsManifest } from "@/lib/connector/reference-data/modules/eurostat-nuts/manifest";
import { ConnectorType, CredentialType } from "@/lib/connector/manifest";

describe("eurostatNutsManifest", () => {
  it("has id eurostat_nuts", () => {
    expect(eurostatNutsManifest.id).toBe("eurostat_nuts");
  });

  it("has a non-empty name", () => {
    expect(typeof eurostatNutsManifest.name).toBe("string");
    expect(eurostatNutsManifest.name.length).toBeGreaterThan(0);
    expect(eurostatNutsManifest.name).toBe("Eurostat NUTS Regions");
  });

  it("has connectorType REFERENCE_DATA", () => {
    expect(eurostatNutsManifest.connectorType).toBe(ConnectorType.REFERENCE_DATA);
  });

  it("has taxonomy nuts_regions", () => {
    expect(eurostatNutsManifest.taxonomy).toBe("nuts_regions");
  });

  describe("credential", () => {
    it("has type NONE (no API key required)", () => {
      expect(eurostatNutsManifest.credential.type).toBe(CredentialType.NONE);
    });

    it("has required false", () => {
      expect(eurostatNutsManifest.credential.required).toBe(false);
    });

    it("has moduleId matching manifest id", () => {
      expect(eurostatNutsManifest.credential.moduleId).toBe("eurostat_nuts");
    });
  });

  describe("healthCheck", () => {
    it("has a defined endpoint URL", () => {
      expect(eurostatNutsManifest.healthCheck).toBeDefined();
      expect(typeof eurostatNutsManifest.healthCheck?.endpoint).toBe("string");
      expect(eurostatNutsManifest.healthCheck?.endpoint?.length).toBeGreaterThan(0);
    });

    it("uses the Eurostat SDMX codelist endpoint", () => {
      expect(eurostatNutsManifest.healthCheck!.endpoint).toContain(
        "eurostat/api/dissemination/sdmx",
      );
    });

    it("has timeoutMs of 10000", () => {
      expect(eurostatNutsManifest.healthCheck!.timeoutMs).toBe(10000);
    });

    it("has a positive intervalMs", () => {
      expect(eurostatNutsManifest.healthCheck!.intervalMs).toBeGreaterThan(0);
    });
  });

  it("has manifestVersion 1", () => {
    expect(eurostatNutsManifest.manifestVersion).toBe(1);
  });
});
