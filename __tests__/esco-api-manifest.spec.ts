/**
 * ESCO Classification Manifest — Unit Tests
 *
 * Verifies that escoClassificationManifest declares the correct identity, credential,
 * and health-check configuration for a health-only reference data module.
 */

import { escoClassificationManifest } from "@/lib/connector/reference-data/modules/esco-classification/manifest";
import { ConnectorType, CredentialType } from "@/lib/connector/manifest";

describe("escoClassificationManifest", () => {
  it("has id esco_classification", () => {
    expect(escoClassificationManifest.id).toBe("esco_classification");
  });

  it("has a non-empty name", () => {
    expect(typeof escoClassificationManifest.name).toBe("string");
    expect(escoClassificationManifest.name.length).toBeGreaterThan(0);
    expect(escoClassificationManifest.name).toBe("ESCO Classification API");
  });

  it("has connectorType REFERENCE_DATA", () => {
    expect(escoClassificationManifest.connectorType).toBe(ConnectorType.REFERENCE_DATA);
  });

  it("has taxonomy esco_occupations", () => {
    expect(escoClassificationManifest.taxonomy).toBe("esco_occupations");
  });

  describe("credential", () => {
    it("has type NONE (no API key required)", () => {
      expect(escoClassificationManifest.credential.type).toBe(CredentialType.NONE);
    });

    it("has required false", () => {
      expect(escoClassificationManifest.credential.required).toBe(false);
    });

    it("has moduleId matching manifest id", () => {
      expect(escoClassificationManifest.credential.moduleId).toBe("esco_classification");
    });
  });

  describe("healthCheck", () => {
    it("has a defined endpoint URL", () => {
      expect(escoClassificationManifest.healthCheck).toBeDefined();
      expect(typeof escoClassificationManifest.healthCheck?.endpoint).toBe("string");
      expect(escoClassificationManifest.healthCheck?.endpoint?.length).toBeGreaterThan(0);
    });

    it("uses the ESCO search API endpoint", () => {
      expect(escoClassificationManifest.healthCheck!.endpoint).toContain(
        "ec.europa.eu/esco/api/search",
      );
    });

    it("has timeoutMs of 10000", () => {
      expect(escoClassificationManifest.healthCheck!.timeoutMs).toBe(10000);
    });

    it("has a positive intervalMs", () => {
      expect(escoClassificationManifest.healthCheck!.intervalMs).toBeGreaterThan(0);
    });
  });

  it("has manifestVersion 1", () => {
    expect(escoClassificationManifest.manifestVersion).toBe(1);
  });
});
