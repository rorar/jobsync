import { getDictionary } from "@/i18n/dictionaries";

/**
 * `DeleteAlertDialog` substitutes a noun into `common.deleteConfirmTitle`
 * (`src/components/DeleteAlertDialog.tsx:39`). Two things can go wrong there,
 * and both did.
 *
 * 1. The noun was hardcoded English at 14 of 17 call sites, so a German user
 *    read "Möchtest du diesen/dieses task wirklich löschen?".
 *
 * 2. Once the nouns were translated, the CARRIER was wrong: it used to supply
 *    the demonstrative itself and could only hedge one gender —
 *    "diesen/dieses {item}" in German, "ce/cet {item}" in French. Half the
 *    nouns in this app are feminine (Aufgabe, Notiz, Aktivität, tâche, note,
 *    activité), so the hedge produced "diesen/dieses Aufgabe": grammatical
 *    nonsense that no amount of choosing a different noun fixes.
 *
 * The demonstrative therefore belongs to the NOUN, which is where gender lives.
 * This test pins that: the carrier may not carry an article, and every
 * `deleteTarget*` value must bring its own in the right language. It is the
 * only thing that catches a new delete dialog added with a bare noun, which is
 * the natural mistake — the English value reads perfectly well without one.
 */

const LOCALES = ["en", "de", "fr", "es"] as const;

/**
 * Accepted demonstratives per locale. French `ce`/`cet` and Spanish
 * `este`/`esta` are both listed because the choice belongs to the noun; this
 * test checks that ONE of them is present, not which — no test can judge the
 * gender of a word it has never seen.
 */
const DEMONSTRATIVES: Record<(typeof LOCALES)[number], string[]> = {
  en: ["this "],
  de: ["diese ", "diesen ", "dieses ", "diesem "],
  fr: ["ce ", "cet ", "cette "],
  es: ["este ", "esta "],
};

describe("delete confirmation nouns", () => {
  it.each(LOCALES)("carries no article in the %s carrier sentence", (locale) => {
    const carrier = getDictionary(locale)["common.deleteConfirmTitle"];

    expect(carrier).toContain("{item}");
    // A slash is how the old carrier hedged gender it could not know.
    expect(carrier).not.toMatch(/\b(diesen\/dieses|ce\/cet|este\/a)\b/);
  });

  it.each(LOCALES)(
    "gives every deleteTarget noun its own demonstrative in %s",
    (locale) => {
      const dict = getDictionary(locale) as Record<string, string>;
      const targets = Object.keys(dict).filter((k) =>
        k.includes("deleteTarget"),
      );

      // Guards the guard: a rename that drops the convention would otherwise
      // leave this test iterating an empty list and passing.
      expect(targets.length).toBeGreaterThanOrEqual(13);

      const offenders = targets.filter(
        (key) =>
          !DEMONSTRATIVES[locale].some((d) =>
            dict[key].toLowerCase().startsWith(d),
          ),
      );

      expect(offenders.map((k) => `${k} = "${dict[k]}"`)).toEqual([]);
    },
  );

  it("substitutes into a sentence with no doubled or missing article", () => {
    // The end-to-end shape, done the way the component does it.
    const de = getDictionary("de");
    const rendered = de["common.deleteConfirmTitle"].replace(
      "{item}",
      (de as Record<string, string>)["tasks.deleteTargetTask"],
    );

    expect(rendered).toBe("Möchtest du diese Aufgabe wirklich löschen?");
  });
});
