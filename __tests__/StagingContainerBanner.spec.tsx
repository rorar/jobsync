/**
 * StagingContainer — "New Items Available" Banner Tests
 *
 * Tests: banner not visible on initial render, banner appears on
 * running→idle phase transition, banner does NOT appear on idle→running,
 * banner does NOT appear on first render when already idle (no prior phase),
 * clicking "Show new items" dismisses banner and reloads.
 *
 * Strategy: render only the phase-transition detection logic by stubbing
 * all server actions (so no network), all child components, and the
 * scheduler hook. We drive the schedulerState through hook mock updates.
 *
 * Spec: scheduler-coordination.allium (StagingContainer new items banner)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import type { SchedulerSnapshot } from "@/lib/scheduler/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "staging.title": "Staging",
        "staging.search": "Search",
        "staging.tabNew": "New",
        "staging.tabDismissed": "Dismissed",
        "staging.tabArchive": "Archive",
        "staging.tabTrash": "Trash",
        "staging.noVacancies": "No vacancies",
        "staging.vacancies": "vacancies",
        "staging.error": "Error",
        "staging.selectAll": "Select all",
        "automations.newItemsAvailable": "New items available",
        "automations.showNewItems": "Show new items",
        "common.loading": "Loading",
        "common.loadMore": "Load more",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

// Controllable scheduler hook
let mockSchedulerState: { state: SchedulerSnapshot | null } = { state: null };

jest.mock("@/hooks/use-scheduler-status", () => ({
  useSchedulerStatus: () => mockSchedulerState,
}));

// Server actions — resolve to empty success so the component doesn't crash
jest.mock("@/actions/stagedVacancy.actions", () => ({
  getStagedVacancies: jest.fn().mockResolvedValue({
    success: true,
    data: [],
    total: 0,
    message: "",
  }),
  getStagedVacancyCounts: jest.fn().mockResolvedValue({
    success: true,
    data: { new: 0, dismissed: 0, archived: 0, trashed: 0 },
  }),
  dismissStagedVacancy: jest.fn(),
  restoreStagedVacancy: jest.fn(),
  archiveStagedVacancy: jest.fn(),
  trashStagedVacancy: jest.fn(),
  restoreFromTrash: jest.fn(),
}));

// Suppress toast in tests
jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

// Stub heavy UI dependencies
jest.mock("@/components/staging/StagedVacancyCard", () => ({
  StagedVacancyCard: () => null,
}));

jest.mock("@/components/staging/PromotionDialog", () => ({
  PromotionDialog: () => null,
}));

jest.mock("@/components/staging/BulkActionBar", () => ({
  BulkActionBar: () => null,
}));

jest.mock("@/components/Loading", () => ({
  __esModule: true,
  default: () => <div data-testid="loading" />,
}));

jest.mock("@/components/RecordsPerPageSelector", () => ({
  RecordsPerPageSelector: () => null,
}));

jest.mock("@/components/RecordsCount", () => ({
  RecordsCount: () => null,
}));

// Stub Shadcn UI components
jest.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardFooter: () => null,
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

jest.mock("@/components/ui/tabs", () => ({
  Tabs: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => <div data-value={value}>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div role="tablist">{children}</div>
  ),
  TabsTrigger: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <button role="tab" data-value={value}>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/input", () => ({
  Input: ({ onChange, value, placeholder }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input onChange={onChange} value={value} placeholder={placeholder} />
  ),
}));

jest.mock("lucide-react", () => ({
  Search: () => null,
}));

jest.mock("@/lib/constants", () => ({
  APP_CONSTANTS: {
    RECORDS_PER_PAGE: 10,
  },
}));

import StagingContainer from "@/components/staging/StagingContainer";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSnapshot(phase: "idle" | "running"): SchedulerSnapshot {
  return {
    phase,
    cycleStartedAt: phase === "running" ? new Date() : null,
    runningAutomations: [],
    pendingAutomations: [],
    lastCycleCompletedAt: null,
    lastCycleProcessedCount: 0,
    lastCycleFailedCount: 0,
    runningProgress: {},
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("StagingContainer — new items banner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSchedulerState = { state: null };
  });

  it("does NOT show the banner on initial render (no phase seen yet)", async () => {
    await act(async () => {
      render(<StagingContainer />);
    });

    expect(screen.queryByText("New items available")).not.toBeInTheDocument();
  });

  it("does NOT show the banner when the initial state is already idle (no prior running)", async () => {
    mockSchedulerState = { state: makeSnapshot("idle") };

    await act(async () => {
      render(<StagingContainer />);
    });

    expect(screen.queryByText("New items available")).not.toBeInTheDocument();
  });

  it("shows the banner when phase transitions from 'running' to 'idle'", async () => {
    mockSchedulerState = { state: makeSnapshot("running") };

    const { rerender } = await act(async () =>
      render(<StagingContainer />),
    );

    // Transition to idle
    await act(async () => {
      mockSchedulerState = { state: makeSnapshot("idle") };
      rerender(<StagingContainer />);
    });

    expect(screen.getByText("New items available")).toBeInTheDocument();
  });

  it("does NOT show the banner on idle→running transition", async () => {
    mockSchedulerState = { state: makeSnapshot("idle") };

    const { rerender } = await act(async () =>
      render(<StagingContainer />),
    );

    await act(async () => {
      mockSchedulerState = { state: makeSnapshot("running") };
      rerender(<StagingContainer />);
    });

    expect(screen.queryByText("New items available")).not.toBeInTheDocument();
  });

  it("does NOT show the banner on running→running (same phase, no transition)", async () => {
    mockSchedulerState = { state: makeSnapshot("running") };

    const { rerender } = await act(async () =>
      render(<StagingContainer />),
    );

    await act(async () => {
      mockSchedulerState = { state: makeSnapshot("running") };
      rerender(<StagingContainer />);
    });

    expect(screen.queryByText("New items available")).not.toBeInTheDocument();
  });

  it("shows 'Show new items' button alongside the banner text", async () => {
    mockSchedulerState = { state: makeSnapshot("running") };

    const { rerender } = await act(async () =>
      render(<StagingContainer />),
    );

    await act(async () => {
      mockSchedulerState = { state: makeSnapshot("idle") };
      rerender(<StagingContainer />);
    });

    expect(screen.getByText("Show new items")).toBeInTheDocument();
  });

  it("dismisses the banner when 'Show new items' is clicked", async () => {
    mockSchedulerState = { state: makeSnapshot("running") };

    const { rerender } = await act(async () =>
      render(<StagingContainer />),
    );

    await act(async () => {
      mockSchedulerState = { state: makeSnapshot("idle") };
      rerender(<StagingContainer />);
    });

    expect(screen.getByText("New items available")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Show new items"));
    });

    expect(screen.queryByText("New items available")).not.toBeInTheDocument();
  });

  it("banner reappears after a second running→idle cycle", async () => {
    mockSchedulerState = { state: makeSnapshot("running") };

    const { rerender } = await act(async () =>
      render(<StagingContainer />),
    );

    // First cycle completion — banner appears
    await act(async () => {
      mockSchedulerState = { state: makeSnapshot("idle") };
      rerender(<StagingContainer />);
    });

    // Dismiss banner
    await act(async () => {
      fireEvent.click(screen.getByText("Show new items"));
    });

    expect(screen.queryByText("New items available")).not.toBeInTheDocument();

    // Second cycle
    await act(async () => {
      mockSchedulerState = { state: makeSnapshot("running") };
      rerender(<StagingContainer />);
    });

    await act(async () => {
      mockSchedulerState = { state: makeSnapshot("idle") };
      rerender(<StagingContainer />);
    });

    expect(screen.getByText("New items available")).toBeInTheDocument();
  });
});
