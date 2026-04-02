/**
 * RunHistoryList Component Tests
 *
 * Tests: loading skeleton, empty state, error state with retry, duration formatting
 * (seconds, minutes, hours), status badge rendering, blocked reason translation.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AutomationRun } from "@/models/automation.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "automations.runHistory": "Run History",
        "automations.runHistoryDesc": "Recent automation runs",
        "automations.runHistoryError": "Failed to load run history",
        "automations.runHistoryRetry": "Retry",
        "automations.noRuns": "No runs yet",
        "automations.noRunsDesc": "This automation hasn't run yet.",
        "automations.statusHeader": "Status",
        "automations.sourceHeader": "Source",
        "automations.startedHeader": "Started",
        "automations.duration": "Duration",
        "automations.searched": "Searched",
        "automations.new": "New",
        "automations.processed": "Processed",
        "automations.matched": "Matched",
        "automations.saved": "Saved",
        "automations.errorHeader": "Error",
        "automations.statusRunning": "Running",
        "automations.statusCompleted": "Completed",
        "automations.statusFailed": "Failed",
        "automations.statusCompletedWithErrors": "Completed with errors",
        "automations.statusBlocked": "Blocked",
        "automations.statusRateLimited": "Rate limited",
        "automations.runSourceManual": "Manual",
        "automations.runSourceScheduler": "Scheduler",
        "automations.blockedAlreadyRunning": "Already running",
        "automations.blockedModuleBusy": "Module busy",
        "automations.elapsedHourMinSec": "{hour}h {min}m {sec}s",
        "automations.elapsedMinSec": "{min}m {sec}s",
        "automations.elapsedSec": "{sec}s",
        "common.hourShort": "h",
        "common.minuteShort": "m",
        "common.secondShort": "s",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateCompact: jest.fn(() => "Apr 1, 2026"),
}));

// Lucide icons — minimal stubs
jest.mock("lucide-react", () => ({
  CheckCircle2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-check" {...props} />
  ),
  XCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-x" {...props} />
  ),
  AlertCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-alert" {...props} />
  ),
  Clock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-clock" {...props} />
  ),
  Ban: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-ban" {...props} />
  ),
  Timer: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-timer" {...props} />
  ),
  History: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-history" {...props} />
  ),
  PlayCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-play" {...props} />
  ),
  RefreshCw: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-refresh" {...props} />
  ),
}));

import { RunHistoryList } from "@/components/automations/RunHistoryList";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<AutomationRun> = {}): AutomationRun {
  const startedAt = new Date("2026-04-01T10:00:00Z");
  return {
    id: "run-1",
    automationId: "auto-1",
    jobsSearched: 50,
    jobsDeduplicated: 40,
    jobsProcessed: 35,
    jobsMatched: 10,
    jobsSaved: 5,
    status: "completed",
    errorMessage: null,
    blockedReason: null,
    startedAt,
    completedAt: new Date(startedAt.getTime() + 45_000), // 45s
    runSource: "scheduler",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite: Loading state
// ---------------------------------------------------------------------------

describe("RunHistoryList - loading state", () => {
  it("renders skeleton pulse rows when loading with no runs", () => {
    const { container } = render(<RunHistoryList runs={[]} loading />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  });

  it("renders the Run History title in loading state", () => {
    render(<RunHistoryList runs={[]} loading />);
    expect(screen.getByText("Run History")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: Empty state
// ---------------------------------------------------------------------------

describe("RunHistoryList - empty state", () => {
  it("renders the empty state with icon when no runs and not loading", () => {
    render(<RunHistoryList runs={[]} />);
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(screen.getByTestId("icon-history")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: Error state
// ---------------------------------------------------------------------------

describe("RunHistoryList - error state", () => {
  it("renders error message when error prop is true", () => {
    render(<RunHistoryList runs={[]} error />);
    expect(screen.getByText("Failed to load run history")).toBeInTheDocument();
    expect(screen.getByTestId("icon-alert")).toBeInTheDocument();
  });

  it("renders retry button when onRetry is provided", () => {
    const onRetry = jest.fn();
    render(<RunHistoryList runs={[]} error onRetry={onRetry} />);
    const retryButton = screen.getByText("Retry");
    expect(retryButton).toBeInTheDocument();
  });

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = jest.fn();
    render(<RunHistoryList runs={[]} error onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not render retry button when onRetry is not provided", () => {
    render(<RunHistoryList runs={[]} error />);
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });

  it("error state takes precedence over loading state", () => {
    render(<RunHistoryList runs={[]} error loading />);
    expect(screen.getByText("Failed to load run history")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: Duration formatting
// ---------------------------------------------------------------------------

describe("RunHistoryList - duration formatting", () => {
  it("formats duration in seconds for runs under 60s", () => {
    const run = makeRun({
      completedAt: new Date(new Date("2026-04-01T10:00:00Z").getTime() + 45_000),
    });
    render(<RunHistoryList runs={[run]} />);
    expect(screen.getByText("45s")).toBeInTheDocument();
  });

  it("formats duration in minutes and seconds for runs 60s-3599s", () => {
    const run = makeRun({
      completedAt: new Date(new Date("2026-04-01T10:00:00Z").getTime() + 150_000), // 2m 30s
    });
    render(<RunHistoryList runs={[run]} />);
    expect(screen.getByText("2m 30s")).toBeInTheDocument();
  });

  it("formats duration with hours for runs >= 3600s", () => {
    const run = makeRun({
      completedAt: new Date(new Date("2026-04-01T10:00:00Z").getTime() + 7_320_000), // 2h 2m 0s
    });
    render(<RunHistoryList runs={[run]} />);
    expect(screen.getByText("2h 2m 0s")).toBeInTheDocument();
  });

  it("formats exactly 1 hour correctly", () => {
    const run = makeRun({
      completedAt: new Date(new Date("2026-04-01T10:00:00Z").getTime() + 3_600_000), // exactly 1h
    });
    render(<RunHistoryList runs={[run]} />);
    expect(screen.getByText("1h 0m 0s")).toBeInTheDocument();
  });

  it("shows dash when run has no completedAt", () => {
    const run = makeRun({ status: "running", completedAt: null });
    render(<RunHistoryList runs={[run]} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: Status badges
// ---------------------------------------------------------------------------

describe("RunHistoryList - status rendering", () => {
  it("renders completed status badge", () => {
    render(<RunHistoryList runs={[makeRun()]} />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("renders failed status badge", () => {
    render(<RunHistoryList runs={[makeRun({ status: "failed", errorMessage: "Timeout" })]} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders blocked reason in error column", () => {
    render(
      <RunHistoryList
        runs={[makeRun({ status: "blocked", blockedReason: "already_running" })]}
      />
    );
    expect(screen.getAllByText("Already running").length).toBeGreaterThanOrEqual(1);
  });

  it("renders run source as scheduler", () => {
    render(<RunHistoryList runs={[makeRun({ runSource: "scheduler" })]} />);
    expect(screen.getByText("Scheduler")).toBeInTheDocument();
  });

  it("renders run source as manual", () => {
    render(<RunHistoryList runs={[makeRun({ runSource: "manual" })]} />);
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });
});
