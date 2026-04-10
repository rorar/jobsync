/**
 * Regression guard for M-P-02 (Sprint 3 Stream D).
 *
 * `getStagedVacancies` in `src/actions/stagedVacancy.actions.ts` used to pull
 * every scalar + every JSON blob per row via `include`, which paid the
 * worst-case detail-sheet cost on every list load. The fix introduces a
 * shared `STAGED_VACANCY_LIST_SELECT` constant and swaps `include` -> `select`.
 *
 * This spec locks the select shape so a future editor cannot silently add a
 * heavy JSON column back into the list path. It imports the constant from the
 * non-server module (`stagedVacancy.select.ts`) to avoid pulling in the
 * `"use server"` action module during unit testing.
 *
 * Context: .team-feature/stream-5b-performance.md M-P-02
 */
import { STAGED_VACANCY_LIST_SELECT } from "@/actions/stagedVacancy.select";

describe("STAGED_VACANCY_LIST_SELECT (M-P-02 regression guard)", () => {
  /**
   * Heavy columns that the list/sheet UI never renders. Adding any of these
   * back to the select shape is a performance regression — `matchData` alone
   * routinely exceeds 10KB per row on real match workloads, and the list
   * can return up to 100 rows per page.
   *
   * If a future feature legitimately needs one of these columns in the list
   * view, remove it from this array AND add a matching field-read in
   * StagedVacancyCard / StagedVacancyDetailContent in the same PR so the
   * guard stays meaningful.
   */
  const FORBIDDEN_HEAVY_COLUMNS = ["matchData", "rawData"] as const;

  it.each(FORBIDDEN_HEAVY_COLUMNS)(
    "must NOT include heavy column %s",
    (column) => {
      expect(
        (STAGED_VACANCY_LIST_SELECT as Record<string, unknown>)[column],
      ).toBeUndefined();
    },
  );

  it("must keep the automation relation select tight (id + name only)", () => {
    const automationSelect = (
      STAGED_VACANCY_LIST_SELECT as unknown as {
        automation: { select: Record<string, unknown> };
      }
    ).automation.select;
    // Only these two keys, in any order. Adding any other field is a perf
    // regression (the sheet renders `automation.name` only).
    expect(Object.keys(automationSelect).sort()).toEqual(["id", "name"]);
    expect(automationSelect.id).toBe(true);
    expect(automationSelect.name).toBe(true);
  });

  it("must include the scalar fields the list + sheet UI actually render", () => {
    // Smoke-check: a handful of representative fields from both card + sheet
    // must still be present. If any of these silently drop out, the UI
    // breaks in ways the TypeScript narrowing will NOT catch (the returned
    // shape is still a valid subset of StagedVacancy).
    const requiredFields = [
      "id",
      "title",
      "employerName",
      "location",
      "description",
      "sourceBoard",
      "matchScore",
      "status",
      "discoveredAt",
      "salaryMin",
      "salaryMax",
      "occupationUris",
      "workingLanguages",
    ] as const;

    for (const field of requiredFields) {
      expect(
        (STAGED_VACANCY_LIST_SELECT as Record<string, unknown>)[field],
      ).toBe(true);
    }
  });
});
