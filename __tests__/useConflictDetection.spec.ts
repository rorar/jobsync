/**
 * useConflictDetection Hook Tests
 *
 * Tests: no-automation early return, blocked conflict (same automation running),
 * contention conflict (same module busy by another automation), and state reset.
 *
 * Spec: scheduler-coordination.allium (surface ConflictWarningDialog + RunCoordinator)
 */

import { renderHook, act } from "@testing-library/react";
import type { AutomationWithResume } from "@/models/automation.model";
import type { SchedulerSnapshot, RunLock } from "@/lib/scheduler/types";
import { useConflictDetection } from "@/hooks/useConflictDetection";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAutomation(
  overrides: Partial<AutomationWithResume> = {},
): AutomationWithResume {
  return {
    id: "auto-1",
    userId: "user-1",
    name: "Test Automation",
    jobBoard: "eures",
    keywords: "Software Engineer",
    location: "de",
    connectorParams: null,
    resumeId: "resume-1",
    matchThreshold: 70,
    scheduleHour: 8,
    scheduleFrequency: "daily",
    nextRunAt: null,
    lastRunAt: null,
    status: "active",
    pauseReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resume: { id: "resume-1", title: "My Resume" },
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<SchedulerSnapshot> = {},
): SchedulerSnapshot {
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

function makeLock(overrides: Partial<RunLock> = {}): RunLock {
  return {
    automationId: "auto-1",
    automationName: "Test Automation",
    runSource: "scheduler",
    moduleId: "eures",
    startedAt: new Date("2026-04-01T10:00:00Z"),
    userId: "user-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite — no automation
// ---------------------------------------------------------------------------

describe("useConflictDetection — no automation", () => {
  it("checkConflict returns false when no automation is set", () => {
    const isRunning = jest.fn(() => false);
    const getModuleBusy = jest.fn(() => [] as RunLock[]);

    const { result } = renderHook(() =>
      useConflictDetection(null, makeSnapshot(), isRunning, getModuleBusy),
    );

    let hasConflict: boolean;
    act(() => {
      hasConflict = result.current.checkConflict();
    });

    expect(hasConflict!).toBe(false);
    expect(result.current.conflictOpen).toBe(false);
    expect(isRunning).not.toHaveBeenCalled();
    expect(getModuleBusy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite — blocked conflict
// ---------------------------------------------------------------------------

describe("useConflictDetection — blocked (same automation running)", () => {
  it("checkConflict returns true and sets blocked type when automation is already running", () => {
    const automation = makeAutomation();
    const lock = makeLock();
    const snapshot = makeSnapshot({ runningAutomations: [lock] });
    const isRunning = jest.fn(() => true);
    const getModuleBusy = jest.fn(() => [] as RunLock[]);

    const { result } = renderHook(() =>
      useConflictDetection(automation, snapshot, isRunning, getModuleBusy),
    );

    let hasConflict: boolean;
    act(() => {
      hasConflict = result.current.checkConflict();
    });

    expect(hasConflict!).toBe(true);
    expect(result.current.conflictOpen).toBe(true);
    expect(result.current.conflictType).toBe("blocked");
    expect(result.current.conflictDetails.automationName).toBe("Test Automation");
    expect(result.current.conflictDetails.runSource).toBe("scheduler");
    expect(result.current.conflictDetails.startedAt).toEqual(
      new Date("2026-04-01T10:00:00Z"),
    );
    // Should not have checked module contention since blocked takes priority
    expect(getModuleBusy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite — contention conflict
// ---------------------------------------------------------------------------

describe("useConflictDetection — contention (same module busy)", () => {
  it("checkConflict returns true and sets contention type when another automation uses the same module", () => {
    const automation = makeAutomation();
    const otherLock = makeLock({
      automationId: "auto-other",
      automationName: "Other Automation",
    });
    const isRunning = jest.fn(() => false);
    const getModuleBusy = jest.fn(() => [otherLock]);

    const { result } = renderHook(() =>
      useConflictDetection(automation, makeSnapshot(), isRunning, getModuleBusy),
    );

    let hasConflict: boolean;
    act(() => {
      hasConflict = result.current.checkConflict();
    });

    expect(hasConflict!).toBe(true);
    expect(result.current.conflictOpen).toBe(true);
    expect(result.current.conflictType).toBe("contention");
    expect(result.current.conflictDetails.moduleId).toBe("eures");
    expect(result.current.conflictDetails.otherAutomations).toEqual([
      "Other Automation",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Suite — state reset
// ---------------------------------------------------------------------------

describe("useConflictDetection — state reset", () => {
  it("setConflictOpen(false) resets conflictOpen to false", () => {
    const automation = makeAutomation();
    const isRunning = jest.fn(() => true);
    const getModuleBusy = jest.fn(() => [] as RunLock[]);
    const snapshot = makeSnapshot({
      runningAutomations: [makeLock()],
    });

    const { result } = renderHook(() =>
      useConflictDetection(automation, snapshot, isRunning, getModuleBusy),
    );

    // First, trigger a conflict to open
    act(() => {
      result.current.checkConflict();
    });
    expect(result.current.conflictOpen).toBe(true);

    // Now close it
    act(() => {
      result.current.setConflictOpen(false);
    });
    expect(result.current.conflictOpen).toBe(false);
  });
});
