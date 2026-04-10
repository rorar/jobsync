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

    // L-Y-02: the announcement text now lives BOTH in an aria-hidden
    // visible span AND in an sr-only status live region (so the button
    // can sit outside the region). Both render the same label, so
    // `getAllByText` returns 2 matches.
    expect(screen.getAllByText("New items available")).toHaveLength(2);
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
    // Banner should be dismissed after clicking — the visible label
    // lives on an aria-hidden span + an sr-only status region, both
    // of which unmount together.
    expect(screen.queryAllByText("New items available")).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Sprint 4 Stream E — L-Y-02: button outside role="status" live region
  // ---------------------------------------------------------------------------

  describe("Sprint 4 Stream E — L-Y-02 live-region split", () => {
    function renderVisibleBanner() {
      mockSchedulerState = { state: makeSnapshot("running") };
      const utils = render(
        <StagingNewItemsBanner onRefresh={mockOnRefresh} />,
      );
      act(() => {
        mockSchedulerState = { state: makeSnapshot("idle") };
        utils.rerender(<StagingNewItemsBanner onRefresh={mockOnRefresh} />);
      });
      return utils;
    }

    it("renders a role=status live region containing only the announcement text", () => {
      const { container } = renderVisibleBanner();

      const statusRegion = container.querySelector('[role="status"]');
      expect(statusRegion).not.toBeNull();
      // L-Y-02 regression guard: the live region must NOT contain an
      // interactive button, otherwise screen readers re-announce the
      // button label on every polite update.
      expect(statusRegion?.querySelector("button")).toBeNull();
      // Text content of the live region is only the announcement.
      expect(statusRegion?.textContent?.trim()).toBe("New items available");
    });

    it("renders the Show-new-items button as a sibling OUTSIDE the live region", () => {
      const { container } = renderVisibleBanner();

      const button = screen.getByText("Show new items").closest("button");
      expect(button).not.toBeNull();
      // The button must not be a descendant of the role=status region.
      const statusRegion = container.querySelector('[role="status"]');
      expect(statusRegion?.contains(button!)).toBe(false);
    });

    it("live region uses polite + atomic announcements", () => {
      const { container } = renderVisibleBanner();
      const statusRegion = container.querySelector('[role="status"]');
      expect(statusRegion).toHaveAttribute("aria-live", "polite");
      expect(statusRegion).toHaveAttribute("aria-atomic", "true");
    });
  });
});
