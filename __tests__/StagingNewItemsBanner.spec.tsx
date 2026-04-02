/**
 * StagingNewItemsBanner Component Tests
 *
 * Tests: returns null when scheduler idle with no phase transition,
 * shows banner on running→idle transition, calls onRefresh on button click.
 *
 * Spec: scheduler-coordination.allium (StagingNewItemsBanner)
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
        "automations.newItemsAvailable": "New items available",
        "automations.showNewItems": "Show new items",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

// Controllable scheduler hook state
let mockSchedulerState: { state: SchedulerSnapshot | null } = { state: null };

jest.mock("@/hooks/use-scheduler-status", () => ({
  useSchedulerStatus: () => mockSchedulerState,
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button onClick={onClick}>
      {children}
    </button>
  ),
}));

import { StagingNewItemsBanner } from "@/components/staging/StagingNewItemsBanner";

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

describe("StagingNewItemsBanner", () => {
  const mockOnRefresh = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSchedulerState = { state: null };
  });

  it("returns null when scheduler is idle with no phase transition", () => {
    mockSchedulerState = { state: makeSnapshot("idle") };

    const { container } = render(
      <StagingNewItemsBanner onRefresh={mockOnRefresh} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows banner when scheduler phase transitions from running to idle", () => {
    mockSchedulerState = { state: makeSnapshot("running") };

    const { rerender } = render(
      <StagingNewItemsBanner onRefresh={mockOnRefresh} />,
    );

    // Transition to idle
    act(() => {
      mockSchedulerState = { state: makeSnapshot("idle") };
      rerender(<StagingNewItemsBanner onRefresh={mockOnRefresh} />);
    });

    expect(screen.getByText("New items available")).toBeInTheDocument();
    expect(screen.getByText("Show new items")).toBeInTheDocument();
  });

  it("calls onRefresh when the 'Show new items' button is clicked", () => {
    mockSchedulerState = { state: makeSnapshot("running") };

    const { rerender } = render(
      <StagingNewItemsBanner onRefresh={mockOnRefresh} />,
    );

    // Transition to idle to make banner visible
    act(() => {
      mockSchedulerState = { state: makeSnapshot("idle") };
      rerender(<StagingNewItemsBanner onRefresh={mockOnRefresh} />);
    });

    fireEvent.click(screen.getByText("Show new items"));

    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    // Banner should be dismissed after clicking
    expect(screen.queryByText("New items available")).not.toBeInTheDocument();
  });
});
