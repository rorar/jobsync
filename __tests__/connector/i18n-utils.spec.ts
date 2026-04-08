import { getModuleName, getModuleDescription, getCredentialHint } from "@/lib/connector/i18n-utils";

describe("i18n-utils", () => {
  describe("getModuleName", () => {
    it("returns locale-specific name when available", () => {
      const module = {
        name: "fallback",
        i18n: {
          en: { name: "English Name", description: "desc" },
          de: { name: "German Name", description: "desc" },
        },
      };
      expect(getModuleName(module, "de")).toBe("German Name");
    });

    it("falls back to English when locale not available", () => {
      const module = {
        name: "fallback",
        i18n: { en: { name: "English Name", description: "desc" } },
      };
      expect(getModuleName(module, "fr")).toBe("English Name");
    });

    it("falls back to manifest.name when i18n is undefined", () => {
      const module = { name: "Raw Name" };
      expect(getModuleName(module, "en")).toBe("Raw Name");
    });

    it("falls back to manifest.name when i18n has no en key", () => {
      const module = {
        name: "Raw Name",
        i18n: { de: { name: "German", description: "desc" } },
      };
      expect(getModuleName(module, "fr")).toBe("Raw Name");
    });
  });

  describe("getModuleDescription", () => {
    it("returns locale-specific description", () => {
      const module = {
        name: "mod",
        i18n: { de: { name: "n", description: "German Desc" } },
      };
      expect(getModuleDescription(module, "de", "fallback")).toBe("German Desc");
    });

    it("falls back to English description", () => {
      const module = {
        name: "mod",
        i18n: { en: { name: "n", description: "English Desc" } },
      };
      expect(getModuleDescription(module, "fr", "fallback")).toBe("English Desc");
    });

    it("falls back to provided fallback string", () => {
      const module = { name: "mod" };
      expect(getModuleDescription(module, "en", "Section description")).toBe("Section description");
    });
  });

  describe("getCredentialHint", () => {
    it("returns locale-specific credential hint", () => {
      const module = {
        name: "mod",
        i18n: { de: { name: "n", description: "d", credentialHint: "DE Hint" } },
      };
      expect(getCredentialHint(module, "de")).toBe("DE Hint");
    });

    it("falls back to English credential hint", () => {
      const module = {
        name: "mod",
        i18n: { en: { name: "n", description: "d", credentialHint: "EN Hint" } },
      };
      expect(getCredentialHint(module, "fr")).toBe("EN Hint");
    });

    it("returns empty string when no credential hint", () => {
      const module = { name: "mod" };
      expect(getCredentialHint(module, "en")).toBe("");
    });
  });
});
