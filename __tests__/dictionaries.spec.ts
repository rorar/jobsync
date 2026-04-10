import { getDictionary, t } from "@/i18n/dictionaries";
import { dashboard } from "@/i18n/dictionaries/dashboard";
import { jobs } from "@/i18n/dictionaries/jobs";
import { activities } from "@/i18n/dictionaries/activities";
import { tasks } from "@/i18n/dictionaries/tasks";
// Sprint 3 follow-up: include staging, automations, and settings in the
// namespace cross-locale consistency check. These were previously omitted,
// leaving a blind spot where missing or empty keys in those namespaces could
// ship undetected.
import { staging } from "@/i18n/dictionaries/staging";
import { automations } from "@/i18n/dictionaries/automations";
import { settings } from "@/i18n/dictionaries/settings";
// Sprint 5 Stream C: developer.ts was extracted from settings.ts so each
// namespace lives in its own dedicated dictionary file. notifications.ts
// was previously omitted because Stream A was mid-edit on it during Sprint 4;
// now that the work has merged we add it to the cross-locale consistency
// check so future drift is caught automatically.
import { developer } from "@/i18n/dictionaries/developer";
import { notifications } from "@/i18n/dictionaries/notifications";

const LOCALES = ["en", "de", "fr", "es"] as const;

const namespaceDictionaries = {
  dashboard,
  jobs,
  activities,
  tasks,
  // Sprint 3 follow-up additions:
  staging,
  automations,
  settings,
  // Sprint 5 Stream C additions:
  developer,
  notifications,
} as const;

describe("getDictionary", () => {
  it("returns a dictionary object for each supported locale", () => {
    for (const locale of LOCALES) {
      const dict = getDictionary(locale);
      expect(dict).toBeDefined();
      expect(typeof dict).toBe("object");
      expect(Object.keys(dict).length).toBeGreaterThan(0);
    }
  });

  it("returns the English dictionary as fallback for an unsupported locale", () => {
    const fallback = getDictionary("zz");
    const english = getDictionary("en");
    expect(fallback).toEqual(english);
  });

  it("returns the English dictionary for an empty string locale", () => {
    const fallback = getDictionary("");
    const english = getDictionary("en");
    expect(fallback).toEqual(english);
  });

  it("returns different translations for different locales", () => {
    const en = getDictionary("en");
    const de = getDictionary("de");
    // "nav.myJobs" is "My Jobs" in English and "Meine Jobs" in German
    expect(en["nav.myJobs"]).toBe("My Jobs");
    expect(de["nav.myJobs"]).toBe("Meine Jobs");
  });
});

describe("t (translate function)", () => {
  it("returns the translated string for a known key", () => {
    expect(t("en", "nav.dashboard")).toBe("Dashboard");
    expect(t("de", "common.save")).toBe("Speichern");
    expect(t("fr", "common.cancel")).toBe("Annuler");
    expect(t("es", "common.delete")).toBe("Eliminar");
  });

  it("returns the key itself as fallback for an unknown key", () => {
    expect(t("en", "nonexistent.key")).toBe("nonexistent.key");
    expect(t("de", "totally.missing")).toBe("totally.missing");
  });

  it("uses the English dictionary when an unsupported locale is provided", () => {
    expect(t("zz", "nav.dashboard")).toBe("Dashboard");
    expect(t("zz", "common.loading")).toBe("Loading...");
  });

  it("returns the key for an unknown key even with an unsupported locale", () => {
    expect(t("zz", "does.not.exist")).toBe("does.not.exist");
  });
});

describe("core dictionary key consistency across locales", () => {
  const enDict = getDictionary("en");
  const enKeys = Object.keys(enDict).sort();

  for (const locale of LOCALES) {
    if (locale === "en") continue;

    it(`locale "${locale}" has the same keys as "en"`, () => {
      const dict = getDictionary(locale);
      const keys = Object.keys(dict).sort();
      expect(keys).toEqual(enKeys);
    });
  }
});

describe("no empty string values in any locale", () => {
  for (const locale of LOCALES) {
    it(`locale "${locale}" has no empty string values`, () => {
      const dict = getDictionary(locale);
      for (const [key, value] of Object.entries(dict)) {
        expect(value).not.toBe("");
        // Provide a helpful message if it fails
        if (value === "") {
          throw new Error(
            `Empty translation value found: locale="${locale}", key="${key}"`
          );
        }
      }
    });
  }
});

describe("key naming convention follows dot notation", () => {
  it("all keys in the merged dictionary use namespace.key format (with optional sub-keys)", () => {
    const dict = getDictionary("en");
    for (const key of Object.keys(dict)) {
      expect(key).toMatch(
        /^[a-zA-Z]+\.[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)*$/
      );
    }
  });
});

describe("namespace dictionaries", () => {
  for (const [nsName, nsDict] of Object.entries(namespaceDictionaries)) {
    describe(`"${nsName}" namespace`, () => {
      it("has entries for all four supported locales", () => {
        for (const locale of LOCALES) {
          expect(nsDict[locale]).toBeDefined();
          expect(typeof nsDict[locale]).toBe("object");
          expect(Object.keys(nsDict[locale]).length).toBeGreaterThan(0);
        }
      });

      it("has consistent keys across all locales", () => {
        const enKeys = Object.keys(nsDict.en).sort();
        for (const locale of LOCALES) {
          if (locale === "en") continue;
          const localeKeys = Object.keys(nsDict[locale]).sort();
          expect(localeKeys).toEqual(enKeys);
        }
      });

      it("has no empty string values in any locale", () => {
        for (const locale of LOCALES) {
          const entries = Object.entries(nsDict[locale]);
          for (const [key, value] of entries) {
            expect(value as string).not.toBe("");
            if ((value as string) === "") {
              throw new Error(
                `Empty value in namespace "${nsName}", locale="${locale}", key="${key}"`
              );
            }
          }
        }
      });

      it(`all keys are prefixed with "${nsName}."`, () => {
        const expectedPrefix = `${nsName}.`;
        for (const locale of LOCALES) {
          for (const key of Object.keys(nsDict[locale])) {
            expect(key.startsWith(expectedPrefix)).toBe(true);
          }
        }
      });
    });
  }
});

describe("merged dictionary completeness", () => {
  it("contains keys from all namespace dictionaries", () => {
    const merged = getDictionary("en");
    const mergedKeys = Object.keys(merged);

    // Check dashboard keys are present
    for (const key of Object.keys(dashboard.en)) {
      expect(mergedKeys).toContain(key);
    }

    // Check jobs keys are present
    for (const key of Object.keys(jobs.en)) {
      expect(mergedKeys).toContain(key);
    }

    // Check activities keys are present
    for (const key of Object.keys(activities.en)) {
      expect(mergedKeys).toContain(key);
    }

    // Check tasks keys are present
    for (const key of Object.keys(tasks.en)) {
      expect(mergedKeys).toContain(key);
    }

    // Sprint 3 follow-up: check staging, automations, settings keys are present.
    for (const key of Object.keys(staging.en)) {
      expect(mergedKeys).toContain(key);
    }
    for (const key of Object.keys(automations.en)) {
      expect(mergedKeys).toContain(key);
    }
    for (const key of Object.keys(settings.en)) {
      expect(mergedKeys).toContain(key);
    }

    // Sprint 5 Stream C: developer was extracted from settings.ts and
    // notifications was previously omitted (Stream A mid-edit in Sprint 4).
    // Both must round-trip through the merged dictionary.
    for (const key of Object.keys(developer.en)) {
      expect(mergedKeys).toContain(key);
    }
    for (const key of Object.keys(notifications.en)) {
      expect(mergedKeys).toContain(key);
    }
  });

  it("contains core keys (nav, auth, settings, common, profile)", () => {
    const merged = getDictionary("en");
    const mergedKeys = Object.keys(merged);
    const coreNamespaces = ["nav", "auth", "settings", "common", "profile"];

    for (const ns of coreNamespaces) {
      const nsKeys = mergedKeys.filter((k) => k.startsWith(`${ns}.`));
      expect(nsKeys.length).toBeGreaterThan(0);
    }
  });

  it("translated values for the same key differ between locales (spot check)", () => {
    const en = getDictionary("en");
    const de = getDictionary("de");
    const fr = getDictionary("fr");
    const es = getDictionary("es");

    // These keys should have different translations across all four locales
    expect(en["common.save"]).toBe("Save");
    expect(de["common.save"]).toBe("Speichern");
    expect(fr["common.save"]).toBe("Enregistrer");
    expect(es["common.save"]).toBe("Guardar");
  });
});
