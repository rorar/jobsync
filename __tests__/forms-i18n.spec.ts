/**
 * forms.* namespace — interpolation + per-locale word-order correctness.
 *
 * These keys back the shared SelectFormCtrl / Combobox controls. The whole point
 * of the `{label}` token (vs a naive `${verb} ${label}` concat at the call site)
 * is to preserve correct word order in locales where the verb is not leading —
 * notably German, where "auswählen" is verb-final. These tests lock that in.
 */

import { t } from "@/i18n/dictionaries";

const fill = (locale: string, key: string, label: string) =>
  t(locale, key).replace("{label}", label);

describe("forms.* placeholder interpolation", () => {
  it("interpolates {label} into the select placeholder per locale", () => {
    expect(fill("en", "forms.selectPlaceholder", "Company")).toBe("Select Company");
    expect(fill("es", "forms.selectPlaceholder", "Empresa")).toBe("Seleccionar Empresa");
    expect(fill("fr", "forms.selectPlaceholder", "Entreprise")).toBe(
      "Sélectionner Entreprise",
    );
  });

  it("preserves German verb-final word order (regression: naive concat would break this)", () => {
    // The {label} sits BEFORE the verb in German — a `${t('select')} ${label}`
    // concat would have produced the wrong "Auswählen Firma".
    expect(fill("de", "forms.selectPlaceholder", "Firma")).toBe("Firma auswählen");
    expect(fill("de", "forms.searchPlaceholder", "Firma")).toBe("Firma suchen");
    expect(fill("de", "forms.createOrSearchPlaceholder", "Firma")).toBe(
      "Firma erstellen oder suchen",
    );
    expect(fill("de", "forms.optionSelected", "Firma")).toBe("Firma ausgewählt");
    expect(fill("de", "forms.optionCreated", "Firma")).toBe("Firma erstellt");
  });

  it("exposes the non-interpolated control strings in every locale", () => {
    for (const locale of ["en", "de", "fr", "es"]) {
      expect(t(locale, "forms.createOption")).not.toBe("forms.createOption");
      expect(t(locale, "forms.noResults")).not.toBe("forms.noResults");
    }
  });
});
