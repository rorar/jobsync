/**
 * Health-Only Reference Data Module Factory Tests
 *
 * Verifies that createEscoClassificationModule() and createEurostatNutsModule()
 * return a ReferenceDataConnector with the correct id.
 */

import { createEscoClassificationModule } from "@/lib/connector/reference-data/modules/esco-classification";
import { createEurostatNutsModule } from "@/lib/connector/reference-data/modules/eurostat-nuts";

describe("createEscoClassificationModule", () => {
  it("returns an object with id esco_classification", () => {
    const module = createEscoClassificationModule();
    expect(module.id).toBe("esco_classification");
  });
});

describe("createEurostatNutsModule", () => {
  it("returns an object with id eurostat_nuts", () => {
    const module = createEurostatNutsModule();
    expect(module.id).toBe("eurostat_nuts");
  });
});
