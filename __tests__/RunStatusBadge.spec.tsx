/**
 * RunStatusBadge Component Tests
 *
 * Tests: idle state (renders nothing), running pill with elapsed time,
 * queued pill with position/total, elapsed time formatting (seconds vs minutes),
 * shared tick subscription lifecycle, aria attributes.
 *
 * Spec: scheduler-coordination.allium (surface RunStatusBadge)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import type { SchedulerSnapshot } from "@/lib/scheduler/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "automations.running": "Running",
        "automations.queued": "Queued",
        "automations.elapsedMinSec": "{min}m {sec}s",
        "automations.elapsedSec": "{sec}s",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

// Controllable hook mock — we drive state from tests
const mockIsAutomationRunning = jest.fn<boolean, [string]>();
const mockState = { current: null as SchedulerSnapshot | null };

jest.mock("@/hooks/use-scheduler-status", () => ({
  useSchedulerStatus: () => ({
    isAutomationRunning: mockIsAutomationRunning,
    state: mockState.current,
  }),
}));

// Lucide icons — minimal stubs
jest.mock("lucide-react", () => ({
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-loader" {...props} />
  ),
  Clock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-clock" {...props} />
  ),
}));

import { RunStatusBadge } from "@/components/automations/RunStatusBadge";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<SchedulerSnapshot> = {}): SchedulerSnapshot {
  return {
    phase: "idle",
    cycleStartedAt: null,
    runningAutomations: [],
    pendingAutomations: [],
    lastCycleCompletedAt: null,
    lastCycleProcessedCount: 0,
    lastCycleFailedCount: 0,
    runningProgress: {},
    ...overrides,
  };
}

const AUTOMATION_ID = "auto-test-123";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("RunStatusBadge — idle state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.current = null;
    mockIsAutomationRunning.mockReturnValue(false);
  });

  it("renders the status container even when idle", () => {
    render(<RunStatusBadge automationId={AUTOMATION_ID} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("does NOT render the running badge when automation is not running and not queued", () => {
    mockState.current = makeSnapshot();
    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    expect(screen.queryByText(/Running/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Queued/i)).not.toBeInTheDocument();
  });

  it("has aria-live='polite' on the sr-only child span", () => {
    render(<RunStatusBadge automationId={AUTOMATION_ID} />);
    const srOnly = screen.getByRole("status").querySelector(".sr-only");
    expect(srOnly).toHaveAttribute("aria-live", "polite");
  });

  it("has aria-atomic='true' on the sr-only child span", () => {
    render(<RunStatusBadge automationId={AUTOMATION_ID} />);
    const srOnly = screen.getByRole("status").querySelector(".sr-only");
    expect(srOnly).toHaveAttribute("aria-atomic", "true");
  });
});

// ---------------------------------------------------------------------------

describe("RunStatusBadge — running state", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockIsAutomationRunning.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the running badge with spinner icon", () => {
    const startedAt = new Date(Date.now() - 10_000); // 10s ago
    mockState.current = makeSnapshot({
      phase: "running",
      runningAutomations: [
        {
          automationId: AUTOMATION_ID,
          automationName: "Test Auto",
          runSource: "scheduler",
          moduleId: "jsearch",
          startedAt,
          userId: "user-1",
        },
      ],
    });

    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    expect(screen.getAllByText(/Running/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
  });

  it("shows elapsed time in seconds format when under 60s", () => {
    const startedAt = new Date(Date.now() - 30_000); // 30 seconds ago
    mockState.current = makeSnapshot({
      phase: "running",
      runningAutomations: [
        {
          automationId: AUTOMATION_ID,
          automationName: "Test Auto",
          runSource: "scheduler",
          moduleId: "jsearch",
          startedAt,
          userId: "user-1",
        },
      ],
    });

    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    // Should render something like "30s" (exact value depends on timing)
    expect(screen.getByText(/\ds\b/)).toBeInTheDocument();
  });

  it("shows elapsed time in minutes format when 60s or more have passed", () => {
    const startedAt = new Date(Date.now() - 90_000); // 1m 30s ago
    mockState.current = makeSnapshot({
      phase: "running",
      runningAutomations: [
        {
          automationId: AUTOMATION_ID,
          automationName: "Test Auto",
          runSource: "scheduler",
          moduleId: "jsearch",
          startedAt,
          userId: "user-1",
        },
      ],
    });

    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    // Should contain "1m" pattern
    expect(screen.getByText(/\dm\s+\d+s/)).toBeInTheDocument();
  });

  it("does NOT render the queued badge when running", () => {
    mockState.current = makeSnapshot({
      phase: "running",
      runningAutomations: [
        {
          automationId: AUTOMATION_ID,
          automationName: "Test",
          runSource: "manual",
          moduleId: "eures",
          startedAt: new Date(),
          userId: "user-1",
        },
      ],
    });

    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    expect(screen.queryByTestId("icon-clock")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe("RunStatusBadge — queued state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAutomationRunning.mockReturnValue(false);
  });

  it("renders the queued badge with clock icon when automation is in the queue", () => {
    mockState.current = makeSnapshot({
      phase: "running",
      pendingAutomations: [
        {
          automationId: AUTOMATION_ID,
          automationName: "Test Auto",
          userId: "user-1",
          position: 2,
          total: 5,
        },
      ],
    });

    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    expect(screen.getAllByText(/Queued/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("icon-clock")).toBeInTheDocument();
  });

  it("shows the correct position/total in the queued badge", () => {
    mockState.current = makeSnapshot({
      pendingAutomations: [
        {
          automationId: AUTOMATION_ID,
          automationName: "Test Auto",
          userId: "user-1",
          position: 3,
          total: 7,
        },
      ],
    });

    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    expect(screen.getByText(/3\/7/)).toBeInTheDocument();
  });

  it("shows position 1 of 1 for a single-item queue", () => {
    mockState.current = makeSnapshot({
      pendingAutomations: [
        {
          automationId: AUTOMATION_ID,
          automationName: "Test Auto",
          userId: "user-1",
          position: 1,
          total: 1,
        },
      ],
    });

    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    expect(screen.getByText(/1\/1/)).toBeInTheDocument();
  });

  it("does NOT show the queued badge for a different automation's queue entry", () => {
    mockState.current = makeSnapshot({
      pendingAutomations: [
        {
          automationId: "different-auto",
          automationName: "Other",
          userId: "user-2",
          position: 1,
          total: 1,
        },
      ],
    });

    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    expect(screen.queryByText(/Queued/i)).not.toBeInTheDocument();
  });

  it("does NOT show running badge when only queued", () => {
    mockState.current = makeSnapshot({
      pendingAutomations: [
        {
          automationId: AUTOMATION_ID,
          automationName: "Test",
          userId: "user-1",
          position: 1,
          total: 2,
        },
      ],
    });

    render(<RunStatusBadge automationId={AUTOMATION_ID} />);

    expect(screen.queryByText(/Running/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("icon-loader")).not.toBeInTheDocument();
  });
});
