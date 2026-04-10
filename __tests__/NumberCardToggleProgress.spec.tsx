/**
 * NumberCardToggle progress bar accessible name — Sprint 3 Stream G
 * M-NEW-01 regression guard.
 *
 * Before this sprint the Progress bar's `aria-label` was:
 *
 *   `${current.trend}% ${current.trend >= 0 ? "increase" : "decrease"}`
 *
 * which hardcoded the English words "increase" / "decrease" into the
 * accessible name regardless of locale. The baseline M-Y-08 findings
 * missed this because the code is not wrapped in `role="status"` so
 * the original grep for "Loading" didn't match.
 *
 * After the fix the label is built from two translated keys:
 * `dashboard.progressIncrease` and `dashboard.progressDecrease`, each
 * with a `{value}` placeholder interpolated via `.replace()`. This
 * spec locks in the translated-label contract.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import NumberCardToggle from "@/components/dashboard/NumberCardToggle";

// Shared translation mock. DE/EN dictionaries are registered here so
// the test can flip locale by controlling the mock's return value.
let activeDict: Record<string, string> = {};
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => activeDict[key] ?? key,
    locale: "en",
  })),
  formatDecimal: (n: number) => String(n),
}));

const EN_DICT: Record<string, string> = {
  "dashboard.jobsApplied": "Jobs Applied",
  "dashboard.period7Days": "7 days",
  "dashboard.period30Days": "30 days",
  "dashboard.progressIncrease": "{value}% increase",
  "dashboard.progressDecrease": "{value}% decrease",
};

const DE_DICT: Record<string, string> = {
  "dashboard.jobsApplied": "Bewerbungen",
  "dashboard.period7Days": "7 Tage",
  "dashboard.period30Days": "30 Tage",
  "dashboard.progressIncrease": "{value}% Anstieg",
  "dashboard.progressDecrease": "{value}% Rückgang",
};

describe("NumberCardToggle — M-NEW-01 Progress bar i18n", () => {
  it("uses the translated 'increase' label on a positive trend (EN)", () => {
    activeDict = EN_DICT;
    render(
      <NumberCardToggle
        data={[{ label: "Last 7 days", num: 12, trend: 5 }]}
      />,
    );

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-label", "5% increase");
  });

  it("uses the translated 'decrease' label on a negative trend (EN)", () => {
    activeDict = EN_DICT;
    render(
      <NumberCardToggle
        data={[{ label: "Last 7 days", num: 10, trend: -3 }]}
      />,
    );

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-label", "-3% decrease");
  });

  it("uses the German 'Anstieg' label when the locale is DE", () => {
    activeDict = DE_DICT;
    render(
      <NumberCardToggle
        data={[{ label: "Last 7 days", num: 12, trend: 5 }]}
      />,
    );

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-label", "5% Anstieg");
  });

  it("uses the German 'Rückgang' label when the locale is DE and trend is negative", () => {
    activeDict = DE_DICT;
    render(
      <NumberCardToggle
        data={[{ label: "Last 7 days", num: 10, trend: -3 }]}
      />,
    );

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-label", "-3% Rückgang");
  });

  it("does NOT leak the literal English words 'increase' or 'decrease' when locale is DE", () => {
    // Regression guard: before M-NEW-01 the label was concatenated
    // inline with hardcoded English, so this assertion would have
    // failed for every DE/FR/ES user.
    activeDict = DE_DICT;
    render(
      <NumberCardToggle
        data={[{ label: "Last 7 days", num: 12, trend: 5 }]}
      />,
    );

    const progress = screen.getByRole("progressbar");
    const label = progress.getAttribute("aria-label") ?? "";
    expect(label).not.toMatch(/increase/i);
    expect(label).not.toMatch(/decrease/i);
  });
});
