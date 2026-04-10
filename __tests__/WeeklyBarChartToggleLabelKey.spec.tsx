/**
 * WeeklyBarChartToggle chart labels — Sprint 3 Stream G Sprint 2
 * follow-up regression guard.
 *
 * Before this sprint the chart toolbar showed the caller-provided raw
 * `label` string ("Jobs", "Activities") regardless of locale, and the
 * card title rendered the same raw string. The Sprint 2 Stream G
 * comment in the file explicitly noted this as a follow-up:
 *
 *   > NOTE: Chart labels come from the server and are not translated
 *   > yet. Passing them through as-is preserves existing behaviour —
 *   > a follow-up task should add a translation lookup table.
 *
 * The fix adds an optional `labelKey: string` field to `ChartConfig`.
 * When set, the component resolves it via `t(labelKey)`; when unset,
 * the legacy `label` string is used as the fallback (backward compat).
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import WeeklyBarChartToggle from "@/components/dashboard/WeeklyBarChartToggle";

// Stub Nivo: not worth mounting in jsdom.
//
// Sprint 4 Stream E L-NEW-* follow-up: the stub now captures the
// `axisLeft.legend` prop so the test can assert the component resolves
// `axisLeftLegendKey` through `t()` at render time. We stash the latest
// props in a module-scoped ref so each test can read them without
// wiring up a shared mock identifier on every render.
const lastNivoProps: { current: Record<string, any> | null } = {
  current: null,
};
jest.mock("@nivo/bar", () => ({
  ResponsiveBar: (props: Record<string, any>) => {
    lastNivoProps.current = props;
    return <div data-testid="nivo-bar-stub" />;
  },
}));

// Locale-aware mock that the test swaps before each assertion block.
let activeDict: Record<string, string> = {};
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => activeDict[key] ?? key,
    locale: "en",
  })),
  formatDecimal: (n: number) => String(n),
}));

const EN_DICT: Record<string, string> = {
  "dashboard.weekly": "Weekly",
  "dashboard.hrs": "hrs",
  "dashboard.chartJobs": "Jobs",
  "dashboard.chartActivities": "Activities",
};

const DE_DICT: Record<string, string> = {
  "dashboard.weekly": "Wöchentlich",
  "dashboard.hrs": "Std.",
  "dashboard.chartJobs": "Jobs",
  "dashboard.chartActivities": "Aktivitäten",
};

const FR_DICT: Record<string, string> = {
  "dashboard.weekly": "Hebdomadaire",
  "dashboard.hrs": "h",
  "dashboard.chartJobs": "Emplois",
  "dashboard.chartActivities": "Activités",
};

function charts() {
  return [
    {
      label: "Jobs",
      labelKey: "dashboard.chartJobs",
      data: [{ day: "Mon", value: 1 }],
      keys: ["value"],
      axisLeftLegend: "JOBS APPLIED",
    },
    {
      label: "Activities",
      labelKey: "dashboard.chartActivities",
      data: [{ day: "Mon", value: 2 }],
      keys: ["value"],
      groupMode: "stacked" as const,
      axisLeftLegend: "TIME SPENT",
    },
  ];
}

describe("WeeklyBarChartToggle — labelKey i18n", () => {
  it("renders English labels via `t(labelKey)` when locale is EN", () => {
    activeDict = EN_DICT;

    render(<WeeklyBarChartToggle charts={charts()} />);

    const group = screen.getByRole("radiogroup", { name: "Weekly" });
    expect(within(group).getByRole("radio", { name: "Jobs" })).toBeInTheDocument();
    expect(
      within(group).getByRole("radio", { name: "Activities" }),
    ).toBeInTheDocument();
  });

  it("renders the German translation when locale is DE", () => {
    activeDict = DE_DICT;

    render(<WeeklyBarChartToggle charts={charts()} />);

    const group = screen.getByRole("radiogroup", { name: "Wöchentlich" });
    expect(
      within(group).getByRole("radio", { name: "Aktivitäten" }),
    ).toBeInTheDocument();
  });

  it("renders the French translation when locale is FR", () => {
    activeDict = FR_DICT;

    render(<WeeklyBarChartToggle charts={charts()} />);

    const group = screen.getByRole("radiogroup", { name: "Hebdomadaire" });
    expect(
      within(group).getByRole("radio", { name: "Emplois" }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("radio", { name: "Activités" }),
    ).toBeInTheDocument();
  });

  it("falls back to the raw `label` when `labelKey` is not set", () => {
    // Backward compatibility — a caller that doesn't set `labelKey`
    // should still see the raw label rendered verbatim.
    activeDict = EN_DICT;

    const legacyCharts = [
      {
        label: "Custom Category",
        data: [{ day: "Mon", value: 1 }],
        keys: ["value"],
        axisLeftLegend: "CUSTOM",
      },
    ];

    render(<WeeklyBarChartToggle charts={legacyCharts} />);

    expect(
      screen.getByRole("radio", { name: "Custom Category" }),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Sprint 4 Stream E — axisLeftLegendKey i18n (Sprint 3 follow-up)
  //
  // The `axisLeftLegend` field used to be a plain English string that
  // was passed verbatim to Nivo's `axisLeft.legend` prop. Sprint 4
  // Stream E adds an optional `axisLeftLegendKey` field that, when set,
  // is resolved via `t(axisLeftLegendKey)` — so DE/FR/ES users see
  // their locale's axis label. The raw string remains as a backward-
  // compatible fallback for dynamic axis labels that don't live in a
  // dictionary.
  // ---------------------------------------------------------------------------
  describe("axisLeftLegendKey i18n (Sprint 4 Stream E)", () => {
    beforeEach(() => {
      lastNivoProps.current = null;
    });

    const chartsWithAxisKey = () => [
      {
        label: "Jobs",
        labelKey: "dashboard.chartJobs",
        data: [{ day: "Mon", value: 1 }],
        keys: ["value"],
        axisLeftLegend: "JOBS APPLIED",
        axisLeftLegendKey: "dashboard.chartJobsApplied",
      },
    ];

    it("passes the translated `axisLeftLegendKey` to Nivo when set (EN)", () => {
      activeDict = {
        ...EN_DICT,
        "dashboard.chartJobsApplied": "JOBS APPLIED",
      };

      render(<WeeklyBarChartToggle charts={chartsWithAxisKey()} />);

      expect(lastNivoProps.current).not.toBeNull();
      expect(lastNivoProps.current?.axisLeft?.legend).toBe("JOBS APPLIED");
    });

    it("passes the translated `axisLeftLegendKey` to Nivo when set (DE)", () => {
      activeDict = {
        ...DE_DICT,
        "dashboard.chartJobsApplied": "BEWERBUNGEN",
      };

      render(<WeeklyBarChartToggle charts={chartsWithAxisKey()} />);

      // Regression guard: without the fix, this would render the raw
      // English `axisLeftLegend` string verbatim instead of the German
      // translation.
      expect(lastNivoProps.current?.axisLeft?.legend).toBe("BEWERBUNGEN");
    });

    it("passes the translated `axisLeftLegendKey` to Nivo when set (FR)", () => {
      activeDict = {
        ...FR_DICT,
        "dashboard.chartJobsApplied": "CANDIDATURES",
      };

      render(<WeeklyBarChartToggle charts={chartsWithAxisKey()} />);

      expect(lastNivoProps.current?.axisLeft?.legend).toBe("CANDIDATURES");
    });

    it("falls back to the raw `axisLeftLegend` when `axisLeftLegendKey` is not set", () => {
      activeDict = EN_DICT; // no chartJobsApplied key in this dict

      const legacyCharts = [
        {
          label: "Custom",
          data: [{ day: "Mon", value: 1 }],
          keys: ["value"],
          axisLeftLegend: "CUSTOM AXIS",
          // No axisLeftLegendKey — backward-compat fallback path.
        },
      ];

      render(<WeeklyBarChartToggle charts={legacyCharts} />);

      expect(lastNivoProps.current?.axisLeft?.legend).toBe("CUSTOM AXIS");
    });

    it("updates the axis legend when the user switches between charts", () => {
      activeDict = {
        ...EN_DICT,
        "dashboard.chartJobsApplied": "JOBS APPLIED",
        "dashboard.chartTimeSpent": "TIME SPENT (Hours)",
      };

      const twoCharts = [
        {
          label: "Jobs",
          labelKey: "dashboard.chartJobs",
          data: [{ day: "Mon", value: 1 }],
          keys: ["value"],
          axisLeftLegend: "JOBS APPLIED",
          axisLeftLegendKey: "dashboard.chartJobsApplied",
        },
        {
          label: "Activities",
          labelKey: "dashboard.chartActivities",
          data: [{ day: "Mon", value: 2 }],
          keys: ["value"],
          groupMode: "stacked" as const,
          axisLeftLegend: "TIME SPENT (Hours)",
          axisLeftLegendKey: "dashboard.chartTimeSpent",
        },
      ];

      render(<WeeklyBarChartToggle charts={twoCharts} />);
      expect(lastNivoProps.current?.axisLeft?.legend).toBe("JOBS APPLIED");

      // Click the Activities radio to switch charts. Use fireEvent instead
      // of the DOM's native `.click()` — testing-library wraps fireEvent in
      // act() so React 18's concurrent updates flush synchronously before
      // the assertion runs. Calling `.click()` directly leaves the setState
      // update pending in a scheduler microtask, which is why the previous
      // spec ran the assertion against stale Nivo props.
      const activitiesRadio = screen.getByRole("radio", {
        name: "Activities",
      });
      fireEvent.click(activitiesRadio);

      // After the switch Nivo is re-rendered with the new chart's
      // resolved axis legend.
      expect(lastNivoProps.current?.axisLeft?.legend).toBe(
        "TIME SPENT (Hours)",
      );
    });
  });

  it("keeps the Activities-total-hours computation gated on the stable `label` identifier", () => {
    // Regression guard: the total-hours gate MUST NOT use the
    // translated label — otherwise the computation would break as
    // soon as the user switches locale.
    activeDict = DE_DICT;

    const chartsWithHours = [
      {
        label: "Activities",
        labelKey: "dashboard.chartActivities",
        data: [{ day: "Mon", foo: 2, bar: 3 }],
        keys: ["foo", "bar"],
        groupMode: "stacked" as const,
        axisLeftLegend: "HOURS",
      },
    ];

    render(<WeeklyBarChartToggle charts={chartsWithHours} />);

    // Total hours should render even though the visible label is now
    // the German translation "Aktivitäten". The gate uses
    // `current.label === "Activities"` which is still true.
    //
    // The production code renders the value + unit as a SINGLE text node
    // inside one `<span>`: `{formatDecimal(totalHours, locale, 1)} {t("dashboard.hrs")}`.
    // That means the full text content is "5 Std." and `getByText("Std.")`
    // (exact match against full element text) will NOT find it. A single
    // regex that matches both the numeric total AND the German unit
    // confirms both pieces are present in the same element without
    // over-coupling to the exact whitespace between them. Per
    // javascript-testing-patterns Best Practice 7 — test behavior
    // (both pieces rendered), not element layout.
    expect(screen.getByText(/5\s+Std\./)).toBeInTheDocument();
  });
});
