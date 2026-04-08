/**
 * Manifest i18n — verifies all modules have co-located translations
 * for all 4 supported locales.
 */

import "@/lib/connector/register-all";
import { moduleRegistry } from "@/lib/connector/registry";

const REQUIRED_LOCALES = ["en", "de", "fr", "es"];

describe("Module manifest i18n", () => {
  const moduleIds = moduleRegistry.availableModules();

  it("all modules are registered", () => {
    expect(moduleIds.length).toBeGreaterThanOrEqual(11);
  });

  for (const moduleId of moduleIds) {
    describe(`module: ${moduleId}`, () => {
      it("has i18n field on manifest", () => {
        const mod = moduleRegistry.get(moduleId);
        expect(mod?.manifest.i18n).toBeDefined();
      });

      for (const locale of REQUIRED_LOCALES) {
        it(`has ${locale} translation with name and description`, () => {
          const mod = moduleRegistry.get(moduleId);
          const entry = mod?.manifest.i18n?.[locale];
          expect(entry).toBeDefined();
          expect(entry?.name.length).toBeGreaterThan(0);
          expect(entry?.description.length).toBeGreaterThan(0);
        });
      }
    });
  }
});
