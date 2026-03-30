/**
 * SchedulerStatusBar Component Tests
 *
 * Tests: null state (SSE not yet connected), idle pill, running pill,
 * active automation name in pill label, queue count badge, popover content
 * (phase, active automation, module, queue list, last completed), and
 * the "no automations" fallback message.
 *
 * Spec: scheduler-coordination.allium (surface SchedulerStatusBar)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import type { SchedulerSnapshot } from "@/lib/scheduler/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "automations.schedulerStatus": "Scheduler Status",
        "automations.schedulerRunning": "Running",
        "automations.schedulerIdle": "Idle",
        "automations.schedulerPhase": "Phase",
        "automations.schedulerPhaseRunning": "Running",
        "automations.schedulerActive": "Active",
        "automations.schedulerModule": "Module",
        "automations.queued": "Queued",
        "automations.schedulerQueueRemaining": "remaining",
        "automations.schedulerLastCompleted": "Last completed",
        "automations.schedulerNoAutomations": "No automations configured",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatRelativeTime: jest.fn(() => "5 minutes ago"),
}));

// Controllable hook state
let mockHookState: {
  state: SchedulerSnapshot | null;
  isRunning: boolean;
} = { state: null, isRunning: false };

jest.mock("@/hooks/use-scheduler-status", () => ({
  useSchedulerStatus: () => mockHookState,
}));

// Inline Popover — renders trigger and content side by side without portals
jest.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    className,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
    variant?: string;
    size?: string;
  }) => (
    <button aria-label={ariaLabel} className={className}>
      {children}
    </button>
  ),
}));

jest.mock("lucide-react", () => ({
  Check: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-check" {...props} />
  ),
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-loader" {...props} />
  ),
}));

import { SchedulerStatusBar } from "@/components/scheduler/SchedulerStatusBar";

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

// ---------------------------------------------------------------------------
// Suite — null state (SSE not connected)
// ---------------------------------------------------------------------------

describe("SchedulerStatusBar — null state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHookState = { state: null, isRunning: false };
  });

  it("renders nothing when state is null (SSE not yet connected)", () => {
    const { container } = render(<SchedulerStatusBar />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite — idle state pill
// ---------------------------------------------------------------------------

describe("SchedulerStatusBar — idle pill", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHookState = { state: makeSnapshot(), isRunning: false };
  });

  it("renders the idle label in the trigger pill", () => {
    render(<SchedulerStatusBar />);
    // "Idle" appears in both pill and popover — at least one must be present
    expect(screen.getAllByText("Idle").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the check icon for idle state", () => {
    render(<SchedulerStatusBar />);
    expect(screen.getByTestId("icon-check")).toBeInTheDocument();
  });

  it("does NOT render the loader icon when idle", () => {
    render(<SchedulerStatusBar />);
    expect(screen.queryByTestId("icon-loader")).not.toBeInTheDocument();
  });

  it("has an accessible aria-label on the trigger button", () => {
    render(<SchedulerStatusBar />);
    expect(
      screen.getByRole("button", { name: "Scheduler Status" }),
    ).toBeInTheDocument();
  });

  it("does NOT show a queue count badge when idle", () => {
    render(<SchedulerStatusBar />);
    // Queue badge renders numbers in a span — no number visible when empty
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — running state pill
// ---------------------------------------------------------------------------

describe("SchedulerStatusBar — running pill", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the loader icon when running", () => {
    mockHookState = {
      state: makeSnapshot({ phase: "running" }),
      isRunning: true,
    };
    render(<SchedulerStatusBar />);
    expect(screen.getByTestId("icon-loader")).toBeInTheDocument();
  });

  it("shows the active automation name in the pill label", () => {
    mockHookState = {
      state: makeSnapshot({
        phase: "running",
        runningAutomations: [
          {
            automationId: "auto-1",
            automationName: "Alpha Search",
            runSource: "scheduler",
            moduleId: "jsearch",
            startedAt: new Date(),
            userId: "user-1",
          },
        ],
      }),
      isRunning: true,
    };
    render(<SchedulerStatusBar />);
    // "Alpha Search" appears in both pill and popover
    expect(screen.getAllByText(/"Alpha Search"/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows generic 'Running' label when no specific automation is named", () => {
    mockHookState = {
      state: makeSnapshot({ phase: "running", runningAutomations: [] }),
      isRunning: true,
    };
    render(<SchedulerStatusBar />);
    // "Running" appears in both pill and popover
    expect(screen.getAllByText("Running").length).toBeGreaterThanOrEqual(1);
  });

  it("shows queue count badge when pending automations exist during a run", () => {
    mockHookState = {
      state: makeSnapshot({
        phase: "running",
        runningAutomations: [
          {
            automationId: "auto-1",
            automationName: "Active",
            runSource: "scheduler",
            moduleId: "jsearch",
            startedAt: new Date(),
            userId: "user-1",
          },
        ],
        pendingAutomations: [
          {
            automationId: "auto-2",
            automationName: "Pending A",
            userId: "user-1",
            position: 1,
            total: 2,
          },
          {
            automationId: "auto-3",
            automationName: "Pending B",
            userId: "user-1",
            position: 2,
            total: 2,
          },
        ],
      }),
      isRunning: true,
    };
    render(<SchedulerStatusBar />);
    // Queue badge shows the count of pending items
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does NOT show queue count badge when there are no pending automations", () => {
    mockHookState = {
      state: makeSnapshot({
        phase: "running",
        runningAutomations: [
          {
            automationId: "auto-1",
            automationName: "Active",
            runSource: "manual",
            moduleId: "eures",
            startedAt: new Date(),
            userId: "user-1",
          },
        ],
      }),
      isRunning: true,
    };
    render(<SchedulerStatusBar />);
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — popover content
// ---------------------------------------------------------------------------

describe("SchedulerStatusBar — popover content", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows 'Idle' phase label in popover when idle", () => {
    mockHookState = { state: makeSnapshot({ phase: "idle" }), isRunning: false };
    render(<SchedulerStatusBar />);
    const popover = screen.getByTestId("popover-content");
    expect(popover).toHaveTextContent("Idle");
  });

  it("shows 'Running' phase label in popover when running", () => {
    mockHookState = {
      state: makeSnapshot({ phase: "running" }),
      isRunning: true,
    };
    render(<SchedulerStatusBar />);
    const popover = screen.getByTestId("popover-content");
    expect(popover).toHaveTextContent("Running");
  });

  it("shows active automation name and module in popover", () => {
    mockHookState = {
      state: makeSnapshot({
        phase: "running",
        runningAutomations: [
          {
            automationId: "auto-1",
            automationName: "Deep Search",
            runSource: "scheduler",
            moduleId: "eures",
            startedAt: new Date(),
            userId: "user-1",
          },
        ],
      }),
      isRunning: true,
    };
    render(<SchedulerStatusBar />);
    const popover = screen.getByTestId("popover-content");
    expect(popover).toHaveTextContent("Deep Search");
    expect(popover).toHaveTextContent("eures");
  });

  it("shows pending automation names in the queue list", () => {
    mockHookState = {
      state: makeSnapshot({
        phase: "running",
        pendingAutomations: [
          {
            automationId: "pend-1",
            automationName: "Queue Entry A",
            userId: "user-1",
            position: 1,
            total: 2,
          },
          {
            automationId: "pend-2",
            automationName: "Queue Entry B",
            userId: "user-1",
            position: 2,
            total: 2,
          },
        ],
      }),
      isRunning: true,
    };
    render(<SchedulerStatusBar />);
    const popover = screen.getByTestId("popover-content");
    expect(popover).toHaveTextContent("Queue Entry A");
    expect(popover).toHaveTextContent("Queue Entry B");
  });

  it("shows last completed relative time when available", () => {
    mockHookState = {
      state: makeSnapshot({
        lastCycleCompletedAt: new Date("2026-01-01T09:55:00Z"),
      }),
      isRunning: false,
    };
    render(<SchedulerStatusBar />);
    const popover = screen.getByTestId("popover-content");
    expect(popover).toHaveTextContent("5 minutes ago");
  });

  it("shows 'No automations configured' when idle with no history", () => {
    mockHookState = {
      state: makeSnapshot({
        phase: "idle",
        runningAutomations: [],
        pendingAutomations: [],
        lastCycleCompletedAt: null,
      }),
      isRunning: false,
    };
    render(<SchedulerStatusBar />);
    const popover = screen.getByTestId("popover-content");
    expect(popover).toHaveTextContent("No automations configured");
  });

  it("does NOT show 'No automations configured' when there is a last completed time", () => {
    mockHookState = {
      state: makeSnapshot({
        lastCycleCompletedAt: new Date("2026-01-01T08:00:00Z"),
      }),
      isRunning: false,
    };
    render(<SchedulerStatusBar />);
    const popover = screen.getByTestId("popover-content");
    expect(popover).not.toHaveTextContent("No automations configured");
  });
});
