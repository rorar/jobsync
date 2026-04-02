/**
 * RED phase test — Finding F1-partial: Missing Prisma error i18n keys
 *
 * The handleError function in src/lib/utils.ts maps Prisma error codes to
 * i18n keys (errors.duplicateEntry, errors.fetchFailed, errors.referenceError),
 * but these keys do NOT exist in any dictionary. When a Prisma P2002, P2003
 * or generic error occurs, the toast will show the raw key string instead of
 * a translated message.
 *
 * These tests SHOULD FAIL because the keys are missing from the dictionaries.
 */

import { getDictionary } from "@/i18n/dictionaries";

describe("Dictionary completeness — Prisma error keys", () => {
  const enDict = getDictionary("en");

  // These keys are referenced by handleError() in src/lib/utils.ts
  // but have never been added to any dictionary.
  const REQUIRED_PRISMA_ERROR_KEYS = [
    "errors.duplicateEntry",
    "errors.fetchFailed",
    "errors.referenceError",
  ];

  test.each(REQUIRED_PRISMA_ERROR_KEYS)(
    "EN dictionary should have key: %s",
    (key) => {
      // The key must exist AND have a non-empty translated string.
      // If the key is missing, getDictionary returns the key itself via t() fallback,
      // but in the raw dictionary it will be undefined.
      expect(enDict[key]).toBeDefined();
      expect(enDict[key]).not.toBe("");
    },
  );

  // Verify ALL 4 locales have the keys (completeness across languages)
  const LOCALES = ["en", "de", "fr", "es"];

  test.each(
    LOCALES.flatMap((locale) =>
      REQUIRED_PRISMA_ERROR_KEYS.map((key) => ({ locale, key })),
    ),
  )("$locale dictionary should have key: $key", ({ locale, key }) => {
    const dict = getDictionary(locale);
    expect(dict[key]).toBeDefined();
    expect(dict[key]).not.toBe("");
  });
});
