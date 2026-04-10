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
} as const;

// Most namespace files host a single key prefix (e.g. `dashboard.*`).
// A few files — historically `settings.ts` — host multiple sibling
// prefixes because they were merged from small sub-areas before we had
// a dedicated file per bounded context. The cross-locale consistency
// and no-empty-values checks still apply to every key; only the
// prefix-equals-filename assertion needs this allowlist.
//
// Adding a new prefix to `settings.ts` (e.g. for a new sub-area) must
// come with a corresponding entry here. Longer term, the Dev Tools and
// SMTP keys should move into their own files (`developer.ts`,
// `smtp.ts`) — see `docs/BUGS.md` Sprint 4 follow-ups.
const EXTRA_ALLOWED_PREFIXES: Partial<Record<keyof typeof namespaceDictionaries, readonly string[]>> = {
  settings: ["developer.", "smtp."],
};

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

      it(`all keys are prefixed with "${nsName}." (or an allowlisted sibling prefix)`, () => {
        const extras =
          EXTRA_ALLOWED_PREFIXES[nsName as keyof typeof namespaceDictionaries] ??
          [];
        const allowedPrefixes = [`${nsName}.`, ...extras];
        for (const locale of LOCALES) {
          for (const key of Object.keys(nsDict[locale])) {
            const matches = allowedPrefixes.some((p) => key.startsWith(p));
            expect(matches).toBe(true);
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
