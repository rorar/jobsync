/**
 * Dashboard toggles — Sprint 2 Stream G H-Y-07 regression guard.
 *
 * Before this sprint, RecentCardToggle / NumberCardToggle /
 * WeeklyBarChartToggle were plain color-swap button groups with NO ARIA
 * semantics — no radiogroup, no aria-checked, no role="radio", no
 * non-color active indicator. They were worse than the CRIT-Y2 baseline
 * because they did not even expose the radio pattern to assistive tech.
 *
 * After the H-Y-07 fix, all three now route through the shared
 * `ToolbarRadioGroup` primitive, gaining:
 *   - role="radiogroup" + translated aria-label
 *   - role="radio" + aria-checked + aria-label per option
 *   - Check glyph non-color indicator on the active option (WCAG 1.4.1)
 *   - Roving tabindex + arrow-key navigation
 *
 * This spec is a behavioural smoke test for all three toggles. The
 * underlying primitive has its own exhaustive test in
 * ToolbarRadioGroup.spec.tsx — these tests only verify the wiring.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import NumberCardToggle from "@/components/dashboard/NumberCardToggle";
import WeeklyBarChartToggle from "@/components/dashboard/WeeklyBarChartToggle";
import RecentCardToggle from "@/components/dashboard/RecentCardToggle";

// Shared translation mock — the dashboard toggles only consume a handful
// of dashboard.* keys. We return a stable English dictionary so accessible
// name assertions are deterministic.
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "dashboard.jobs": "Jobs",
        "dashboard.activities": "Activities",
        "dashboard.recent": "Recent",
        "dashboard.weekly": "Weekly",
        "dashboard.jobsApplied": "Jobs Applied",
        "dashboard.period7Days": "7 days",
        "dashboard.period30Days": "30 days",
        "dashboard.hrs": "hrs",
        "dashboard.na": "N/A",
        "dashboard.unknown": "Unknown",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: (d: Date) => d.toISOString().slice(0, 10),
  formatDecimal: (n: number) => String(n),
}));

// Nivo bar uses WebGL/Canvas paths that aren't worth mounting in jsdom.
// Stub it — the toggle test only cares about the toolbar, not the chart.
jest.mock("@nivo/bar", () => ({
  ResponsiveBar: () => <div data-testid="nivo-bar-stub" />,
}));

describe("NumberCardToggle — H-Y-07", () => {
  const data = [
    { label: "Last 7 days", num: 12, trend: 5 },
    { label: "Last 30 days", num: 48, trend: -3 },
  ];

  it("exposes a radiogroup with role=radio + aria-checked per option", () => {
    render(<NumberCardToggle data={data} />);

    const group = screen.getByRole("radiogroup", { name: "Jobs Applied" });
    expect(group).toBeInTheDocument();

    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);

    // First period is selected on mount (activeIndex = 0)
    expect(
      screen.getByRole("radio", { name: "7 days" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: "30 days" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("renders the non-color Check glyph on the active period", () => {
    render(<NumberCardToggle data={data} />);

    const indicators = screen.getAllByTestId(
      "number-card-active-indicator",
    );
    expect(indicators).toHaveLength(1);
    expect(indicators[0]).toHaveAttribute("aria-hidden", "true");

    const activeRadio = screen.getByRole("radio", { name: "7 days" });
    expect(activeRadio).toContainElement(indicators[0]);
  });

  it("switches the displayed number when the user clicks a different period", () => {
    render(<NumberCardToggle data={data} />);

    // Default active is index 0 → num 12
    expect(screen.getByText("12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "30 days" }));

    // New active → num 48
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "30 days" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

describe("WeeklyBarChartToggle — H-Y-07", () => {
  const charts = [
    {
      label: "Jobs",
      data: [{ day: "Mon", value: 1 }],
      keys: ["value"],
      axisLeftLegend: "jobs",
    },
    {
      label: "Activities",
      data: [{ day: "Mon", value: 2 }],
      keys: ["value"],
      groupMode: "stacked" as const,
      axisLeftLegend: "hrs",
    },
  ];

  it("exposes a radiogroup around the chart toggle", () => {
    render(<WeeklyBarChartToggle charts={charts} />);

    const group = screen.getByRole("radiogroup", { name: "Weekly" });
    expect(group).toBeInTheDocument();

    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);

    expect(screen.getByRole("radio", { name: "Jobs" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("radio", { name: "Activities" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("renders the non-color Check glyph", () => {
    render(<WeeklyBarChartToggle charts={charts} />);
    const indicator = screen.getByTestId("weekly-chart-active-indicator");
    expect(indicator).toHaveAttribute("aria-hidden", "true");
  });

  it("switches charts via arrow keys", () => {
    render(<WeeklyBarChartToggle charts={charts} />);

    const group = screen.getByRole("radiogroup", { name: "Weekly" });
    fireEvent.keyDown(group, { key: "ArrowRight" });

    expect(
      screen.getByRole("radio", { name: "Activities" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

describe("RecentCardToggle — H-Y-07", () => {
  const jobs: any[] = [];
  const activities: any[] = [];

  it("exposes a radiogroup with Jobs/Activities radios", () => {
    render(<RecentCardToggle jobs={jobs} activities={activities} />);

    const group = screen.getByRole("radiogroup", { name: "Recent" });
    expect(group).toBeInTheDocument();

    expect(screen.getByRole("radio", { name: "Jobs" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("radio", { name: "Activities" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("renders the Check glyph on the active tab", () => {
    render(<RecentCardToggle jobs={jobs} activities={activities} />);

    const indicator = screen.getByTestId("recent-card-active-indicator");
    expect(indicator).toHaveAttribute("aria-hidden", "true");

    const jobsRadio = screen.getByRole("radio", { name: "Jobs" });
    expect(jobsRadio).toContainElement(indicator);
  });

  it("switches the active tab on click", () => {
    render(<RecentCardToggle jobs={jobs} activities={activities} />);

    fireEvent.click(screen.getByRole("radio", { name: "Activities" }));

    expect(
      screen.getByRole("radio", { name: "Activities" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Jobs" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
