/**
 * Self-registration — verifies that importing register-all.ts
 * registers all modules in the unified registry.
 */

import "@/lib/connector/register-all";
import { moduleRegistry } from "@/lib/connector/registry";
import { ConnectorType } from "@/lib/connector/manifest";

describe("register-all.ts", () => {
  it("registers all 11 modules", () => {
    expect(moduleRegistry.availableModules().length).toBe(11);
  });

  it("registers job discovery modules", () => {
    const jd = moduleRegistry.getByType(ConnectorType.JOB_DISCOVERY);
    expect(jd.map(m => m.manifest.id).sort()).toEqual(["arbeitsagentur", "eures", "jsearch"]);
  });

  it("registers ai provider modules", () => {
    const ai = moduleRegistry.getByType(ConnectorType.AI_PROVIDER);
    expect(ai.map(m => m.manifest.id).sort()).toEqual(["deepseek", "ollama", "openai"]);
  });

  it("registers data enrichment modules", () => {
    const de = moduleRegistry.getByType(ConnectorType.DATA_ENRICHMENT);
    expect(de.map(m => m.manifest.id).sort()).toEqual(["google_favicon", "logo_dev", "meta_parser"]);
  });

  it("registers reference data modules", () => {
    const rd = moduleRegistry.getByType(ConnectorType.REFERENCE_DATA);
    expect(rd.map(m => m.manifest.id).sort()).toEqual(["esco_classification", "eurostat_nuts"]);
  });
});
