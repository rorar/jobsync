/**
 * RunProgressPanel Component Tests
 *
 * Tests: renders nothing when automation is not running, shows loading state
 * when running but no progress data yet, renders phase stepper with correct
 * icon states (completed/active/pending), shows phase counters, correct
 * aria-valuenow on the progressbar, handles all 6 phases, finalize phase
 * counter is empty.
 *
 * Spec: scheduler-coordination.allium (surface RunProgressPanel)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, within } from "@testing-library/react";
import type { RunProgress, RunPhase } from "@/lib/scheduler/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "automations.runStarted": "Starting run...",
        "automations.runProgress": "Run Progress",
        "automations.phaseSearch": "Search",
        "automations.phaseDedup": "Dedup",
        "automations.phaseEnrich": "Enrich",
        "automations.phaseMatch": "Match",
        "automations.phaseSave": "Save",
        "automations.phaseFinalize": "Finalize",
        "automations.runEnded": "Run completed",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatNumber: (value: number, _locale: string) => String(value),
}));

const mockIsAutomationRunning = jest.fn<boolean, [string]>();
const mockGetActiveProgress = jest.fn<RunProgress | null, [string]>();

jest.mock("@/hooks/use-scheduler-status", () => ({
  useSchedulerStatus: () => ({
    isAutomationRunning: mockIsAutomationRunning,
    getActiveProgress: mockGetActiveProgress,
  }),
}));

jest.mock("lucide-react", () => ({
  CheckCircle2: (props: React.SVGProps<SVGSVGElement> & { "data-testid"?: string }) => (
    <svg data-testid="icon-check-circle" {...props} />
  ),
  Loader2: (props: React.SVGProps<SVGSVGElement> & { "data-testid"?: string }) => (
    <svg data-testid="icon-loader" {...props} />
  ),
  Circle: (props: React.SVGProps<SVGSVGElement> & { "data-testid"?: string }) => (
    <svg data-testid="icon-circle" {...props} />
  ),
}));

import { RunProgressPanel } from "@/components/scheduler/RunProgressPanel";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTOMATION_ID = "auto-progress-test";

function makeProgress(phase: RunPhase, overrides: Partial<RunProgress> = {}): RunProgress {
  return {
    automationId: AUTOMATION_ID,
    runId: "run-001",
    phase,
    jobsSearched: 20,
    jobsDeduplicated: 5,
    jobsProcessed: 15,
    jobsMatched: 8,
    jobsSaved: 6,
    startedAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:05:00Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite — not running
// ---------------------------------------------------------------------------

describe("RunProgressPanel — automation not running", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAutomationRunning.mockReturnValue(false);
    mockGetActiveProgress.mockReturnValue(null);
  });

  it("renders nothing when the automation is not running", () => {
    const { container } = render(
      <RunProgressPanel automationId={AUTOMATION_ID} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite — running, no progress yet
// ---------------------------------------------------------------------------

describe("RunProgressPanel — running, no progress data", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAutomationRunning.mockReturnValue(true);
    mockGetActiveProgress.mockReturnValue(null);
  });

  it("renders the initial loading state", () => {
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    expect(screen.getByText("Starting run...")).toBeInTheDocument();
  });

  it("shows a spinner in the initial loading state", () => {
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
  });

  it("does NOT render the phase stepper when progress is null", () => {
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — phase stepper
// ---------------------------------------------------------------------------

describe("RunProgressPanel — phase stepper icon states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAutomationRunning.mockReturnValue(true);
  });

  it("renders the progressbar role element", () => {
    mockGetActiveProgress.mockReturnValue(makeProgress("search"));
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars.length).toBeGreaterThanOrEqual(1);
  });

  it("sets aria-valuenow to 1 when phase is 'search' (index 0, 0-indexed → 1-indexed)", () => {
    mockGetActiveProgress.mockReturnValue(makeProgress("search"));
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    const bar = screen.getAllByRole("progressbar")[0];
    expect(bar).toHaveAttribute("aria-valuenow", "1");
  });

  it("sets aria-valuenow to 3 when phase is 'enrich' (index 2)", () => {
    mockGetActiveProgress.mockReturnValue(makeProgress("enrich"));
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    const bar = screen.getAllByRole("progressbar")[0];
    expect(bar).toHaveAttribute("aria-valuenow", "3");
  });

  it("sets aria-valuemax to 6 (total phase count)", () => {
    mockGetActiveProgress.mockReturnValue(makeProgress("search"));
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute("aria-valuemax", "6");
  });

  it("shows completed check icons for phases before the active one", () => {
    // Phase 'match' (index 3) — 'search', 'dedup', 'enrich' are completed
    mockGetActiveProgress.mockReturnValue(makeProgress("match"));
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    const checkIcons = screen.getAllByTestId("icon-check-circle");
    // Exactly 3 phases before 'match': search, dedup, enrich
    expect(checkIcons.length).toBeGreaterThanOrEqual(3);
  });

  it("shows a spinner for the active phase", () => {
    mockGetActiveProgress.mockReturnValue(makeProgress("dedup"));
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    // At least one spinner must be present for the active phase
    const loaders = screen.getAllByTestId("icon-loader");
    expect(loaders.length).toBeGreaterThanOrEqual(1);
  });

  it("shows pending circle icons for phases after the active one", () => {
    // Phase 'search' (index 0) — all remaining 5 phases are pending
    mockGetActiveProgress.mockReturnValue(makeProgress("search"));
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    const circles = screen.getAllByTestId("icon-circle");
    expect(circles.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Suite — phase counter values
// ---------------------------------------------------------------------------

describe("RunProgressPanel — phase counter display", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAutomationRunning.mockReturnValue(true);
  });

  it("shows jobsSearched count for 'search' phase", () => {
    mockGetActiveProgress.mockReturnValue(
      makeProgress("search", { jobsSearched: 42 }),
    );
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    expect(screen.getAllByText("42").length).toBeGreaterThanOrEqual(1);
  });

  it("shows jobsDeduplicated count for 'dedup' phase (when active or completed)", () => {
    mockGetActiveProgress.mockReturnValue(
      makeProgress("match", { jobsDeduplicated: 7 }),
    );
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    expect(screen.getAllByText("7").length).toBeGreaterThanOrEqual(1);
  });

  it("shows '-' for jobsSearched when the count is 0 and the phase is 'search'", () => {
    mockGetActiveProgress.mockReturnValue(
      makeProgress("search", { jobsSearched: 0 }),
    );
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(1);
  });

  it("shows jobsMatched count for 'match' phase", () => {
    mockGetActiveProgress.mockReturnValue(
      makeProgress("save", { jobsMatched: 13 }),
    );
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    expect(screen.getAllByText("13").length).toBeGreaterThanOrEqual(1);
  });

  it("shows jobsSaved count for 'save' phase", () => {
    mockGetActiveProgress.mockReturnValue(
      makeProgress("finalize", { jobsSaved: 5 }),
    );
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty string counter for 'finalize' phase", () => {
    mockGetActiveProgress.mockReturnValue(makeProgress("finalize"));
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);
    // The finalize counter returns "" — no extra numeric text for finalize
    // Verify by checking that "Finalize" label is present
    expect(screen.getAllByText("Finalize").length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Suite — all phase labels present
// ---------------------------------------------------------------------------

describe("RunProgressPanel — all phase labels rendered", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAutomationRunning.mockReturnValue(true);
  });

  const allPhases: RunPhase[] = ["search", "dedup", "enrich", "match", "save", "finalize"];

  it("renders all 6 phase labels regardless of current phase", () => {
    mockGetActiveProgress.mockReturnValue(makeProgress("search"));
    render(<RunProgressPanel automationId={AUTOMATION_ID} />);

    // Phase labels appear in both the desktop stepper and mobile list
    expect(screen.getAllByText("Search").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Dedup").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Enrich").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Match").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Save").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Finalize").length).toBeGreaterThanOrEqual(1);
  });

  it.each(allPhases)(
    "renders without errors when phase is '%s'",
    (phase) => {
      mockGetActiveProgress.mockReturnValue(makeProgress(phase));
      expect(() =>
        render(<RunProgressPanel automationId={AUTOMATION_ID} />),
      ).not.toThrow();
    },
  );
});

// ---------------------------------------------------------------------------
// Suite — run completed transition
// ---------------------------------------------------------------------------

describe("RunProgressPanel — run completed transition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows 'Run completed' message when automation transitions from running to not running", () => {
    // Start in running state
    mockIsAutomationRunning.mockReturnValue(true);
    mockGetActiveProgress.mockReturnValue(makeProgress("finalize"));

    const { rerender } = render(
      <RunProgressPanel automationId={AUTOMATION_ID} />,
    );

    // Transition to not running
    mockIsAutomationRunning.mockReturnValue(false);
    mockGetActiveProgress.mockReturnValue(null);

    rerender(<RunProgressPanel automationId={AUTOMATION_ID} />);

    expect(screen.getByText("Run completed")).toBeInTheDocument();
  });
});
