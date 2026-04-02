import {
  STATUS_DISPLAY_KEYS,
  MODULE_DISPLAY_KEYS,
} from "@/lib/automation-display-keys";

describe("Automation Display Keys", () => {
  describe("STATUS_DISPLAY_KEYS", () => {
    it("should have keys for 'active' and 'paused'", () => {
      expect(STATUS_DISPLAY_KEYS["active"]).toBeDefined();
      expect(STATUS_DISPLAY_KEYS["paused"]).toBeDefined();
    });

    it("should use automations namespace for i18n keys", () => {
      expect(STATUS_DISPLAY_KEYS["active"]).toBe("automations.statusActive");
      expect(STATUS_DISPLAY_KEYS["paused"]).toBe("automations.statusPaused");
    });

    it("should have string values following i18n key format", () => {
      for (const [, value] of Object.entries(STATUS_DISPLAY_KEYS)) {
        expect(typeof value).toBe("string");
        expect(value).toMatch(/^automations\.\w+$/);
      }
    });
  });

  describe("MODULE_DISPLAY_KEYS", () => {
    it("should have keys for all registered modules", () => {
      expect(MODULE_DISPLAY_KEYS["eures"]).toBeDefined();
      expect(MODULE_DISPLAY_KEYS["arbeitsagentur"]).toBeDefined();
      expect(MODULE_DISPLAY_KEYS["jsearch"]).toBeDefined();
    });

    it("should use automations namespace for i18n keys", () => {
      expect(MODULE_DISPLAY_KEYS["eures"]).toBe("automations.moduleEures");
      expect(MODULE_DISPLAY_KEYS["arbeitsagentur"]).toBe("automations.moduleArbeitsagentur");
      expect(MODULE_DISPLAY_KEYS["jsearch"]).toBe("automations.moduleJsearch");
    });

    it("should have string values following i18n key format", () => {
      for (const [, value] of Object.entries(MODULE_DISPLAY_KEYS)) {
        expect(typeof value).toBe("string");
        expect(value).toMatch(/^automations\.\w+$/);
      }
    });
  });
});
