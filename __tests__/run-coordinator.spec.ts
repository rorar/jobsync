/**
 * RunCoordinator Unit Tests
 *
 * Tests: mutex acquisition, double-run prevention, lock release (success + error),
 * module contention, scheduler cycle lifecycle, progress reporting, queue tracking,
 * orphan reconciliation, and domain event emission.
 *
 * Spec: specs/scheduler-coordination.allium
 * Invariant: NoConcurrentSameAutomation — at most one RunLock per automationId
 */

// Suppress debug output in test runs
jest.mock("@/lib/debug", () => ({
  debugLog: jest.fn(),
  debugError: jest.fn(),
}));

// Mock runAutomation — the external runner is an integration point, not under test
jest.mock("@/lib/connector/job-discovery", () => ({
  runAutomation: jest.fn(),
}));

// Mock event emission so we can assert on domain event payloads without a live bus
jest.mock("@/lib/events", () => ({
  emitEvent: jest.fn(),
  createEvent: jest.fn((type: string, payload: unknown) => ({ type, payload })),
}));

// Mock db for reconcileOrphanedRuns — only automationRun.updateMany is exercised
jest.mock("@/lib/db", () => {
  const mockPrisma = {
    automationRun: {
      updateMany: jest.fn(),
    },
  };
  return { __esModule: true, default: mockPrisma };
});

import { runCoordinator, reconcileOrphanedRuns } from "@/lib/scheduler/run-coordinator";
import { runAutomation } from "@/lib/connector/job-discovery";
import { emitEvent, createEvent } from "@/lib/events";
import { DomainEventType } from "@/lib/events/event-types";
import { mockAutomation, mockUser } from "@/lib/data/testFixtures";
import type { Automation } from "@/models/automation.model";
import type { RunOptions, RunnerResult, RunProgress } from "@/lib/scheduler/types";
import prisma from "@/lib/db";

// ─── Typed mock handles ───────────────────────────────────────────────────────

const mockRunAutomation = runAutomation as jest.MockedFunction<typeof runAutomation>;
const mockEmitEvent = emitEvent as jest.MockedFunction<typeof emitEvent>;
const mockCreateEvent = createEvent as jest.MockedFunction<typeof createEvent>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const schedulerOptions: RunOptions = { runSource: "scheduler" };
const manualOptions: RunOptions = { runSource: "manual" };

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return { ...mockAutomation, ...overrides };
}

const automationA = makeAutomation({
  id: "auto-a",
  name: "Automation Alpha",
  jobBoard: "jsearch",
  userId: "user-1",
});

const automationB = makeAutomation({
  id: "auto-b",
  name: "Automation Beta",
  jobBoard: "eures",
  userId: "user-2",
});

const automationC = makeAutomation({
  id: "auto-c",
  name: "Automation Gamma",
  jobBoard: "jsearch", // Same module as automationA — triggers contention
  userId: "user-3",
});

const successResult: RunnerResult = {
  runId: "run-xyz-001",
  status: "completed",
  jobsSearched: 42,
  jobsDeduplicated: 10,
  jobsProcessed: 32,
  jobsMatched: 8,
  jobsSaved: 5,
};

// ─── State reset helper ───────────────────────────────────────────────────────
//
// The exported `runCoordinator` is a module-level singleton that accumulates
// state. Each test must bring it back to a known baseline before asserting.
// We do this by draining all active locks via completeCycle() + waiting for any
// in-flight requestRun() promises to settle.

function resetCoordinatorState(): void {
  // If we left a cycle running, complete it to reset phase + queue
  const snapshot = runCoordinator.getState();
  if (snapshot.phase !== "idle") {
    runCoordinator.completeCycle();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("RunCoordinator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetCoordinatorState();

    // Default: runAutomation resolves successfully
    mockRunAutomation.mockResolvedValue(successResult);

    // Ensure createEvent returns a minimal shaped event so emitEvent receives it
    mockCreateEvent.mockImplementation(
      (type: string, payload: unknown) =>
        ({ type, timestamp: new Date(), payload }) as any,
    );
  });

  // ─── Mutex Acquisition ──────────────────────────────────────────────────────

  describe("requestRun — mutex acquisition", () => {
    it("returns status 'acquired' when no lock exists for the automation", async () => {
      const result = await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(result.status).toBe("acquired");
    });

    it("returns runId from RunnerResult on success", async () => {
      const result = await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(result.runId).toBe(successResult.runId);
    });

    it("runId is undefined when runAutomation throws", async () => {
      mockRunAutomation.mockRejectedValue(new Error("connector failure"));

      const result = await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(result.status).toBe("acquired");
      expect(result.runId).toBeUndefined();
    });
  });

  // ─── Double-Run Prevention ──────────────────────────────────────────────────

  describe("requestRun — double-run prevention", () => {
    it("returns 'already_running' when same automationId is requested while locked", async () => {
      // Hold the first run open until we can fire the second request
      let releaseFirstRun!: (value: RunnerResult) => void;
      mockRunAutomation.mockReturnValueOnce(
        new Promise<RunnerResult>((resolve) => {
          releaseFirstRun = resolve;
        }),
      );

      // Start first run (does NOT await — let it hang)
      const firstRunPromise = runCoordinator.requestRun(automationA, schedulerOptions);

      // Give the coordinator one microtask tick to acquire the lock synchronously
      await Promise.resolve();

      // Second request for the same automation while first is still holding the lock
      const secondResult = await runCoordinator.requestRun(automationA, manualOptions);

      expect(secondResult.status).toBe("already_running");
      expect(secondResult.existingRunSource).toBe("scheduler");
      expect(secondResult.existingStartedAt).toBeInstanceOf(Date);

      // Clean up: let the first run finish
      releaseFirstRun(successResult);
      await firstRunPromise;
    });

    it("does NOT block a different automationId from running concurrently", async () => {
      let releaseA!: (value: RunnerResult) => void;
      mockRunAutomation.mockReturnValueOnce(
        new Promise<RunnerResult>((resolve) => {
          releaseA = resolve;
        }),
      );
      mockRunAutomation.mockResolvedValueOnce(successResult);

      const firstRunPromise = runCoordinator.requestRun(automationA, schedulerOptions);
      await Promise.resolve();

      const resultB = await runCoordinator.requestRun(automationB, schedulerOptions);

      expect(resultB.status).toBe("acquired");

      releaseA(successResult);
      await firstRunPromise;
    });
  });

  // ─── Lock Release on Success ────────────────────────────────────────────────

  describe("requestRun — lock release", () => {
    it("releases lock after successful run so the same automation can run again", async () => {
      mockRunAutomation.mockResolvedValue(successResult);

      await runCoordinator.requestRun(automationA, schedulerOptions);

      // Lock must be gone immediately after the first call resolves
      expect(runCoordinator.getRunStatus(automationA.id)).toBeNull();

      // A second request must succeed, not return 'already_running'
      const secondResult = await runCoordinator.requestRun(automationA, schedulerOptions);
      expect(secondResult.status).toBe("acquired");
    });

    it("releases lock even when runAutomation throws (try/finally)", async () => {
      mockRunAutomation.mockRejectedValue(new Error("unexpected connector failure"));

      await runCoordinator.requestRun(automationA, schedulerOptions);

      // Lock must be released despite the error
      expect(runCoordinator.getRunStatus(automationA.id)).toBeNull();

      // A new run must be acquirable after the error
      mockRunAutomation.mockResolvedValue(successResult);
      const retryResult = await runCoordinator.requestRun(automationA, schedulerOptions);
      expect(retryResult.status).toBe("acquired");
    });
  });

  // ─── Module Contention Detection ───────────────────────────────────────────

  describe("requestRun — module contention", () => {
    it("includes moduleContention when another automation using the same moduleId is running", async () => {
      let releaseA!: (value: RunnerResult) => void;
      mockRunAutomation.mockReturnValueOnce(
        new Promise<RunnerResult>((resolve) => {
          releaseA = resolve;
        }),
      );
      mockRunAutomation.mockResolvedValueOnce(successResult);

      // automationA on "jsearch" starts first
      const firstRunPromise = runCoordinator.requestRun(automationA, schedulerOptions);
      await Promise.resolve();

      // automationC is also on "jsearch" — should detect contention
      const resultC = await runCoordinator.requestRun(automationC, schedulerOptions);

      expect(resultC.status).toBe("acquired");
      expect(resultC.moduleContention).toBeDefined();
      expect(resultC.moduleContention).toHaveLength(1);
      expect(resultC.moduleContention![0].automationId).toBe(automationA.id);
      expect(resultC.moduleContention![0].automationName).toBe(automationA.name);
      expect(resultC.moduleContention![0].moduleId).toBe("jsearch");

      releaseA(successResult);
      await firstRunPromise;
    });

    it("does NOT populate moduleContention when modules are different", async () => {
      let releaseA!: (value: RunnerResult) => void;
      mockRunAutomation.mockReturnValueOnce(
        new Promise<RunnerResult>((resolve) => {
          releaseA = resolve;
        }),
      );
      mockRunAutomation.mockResolvedValueOnce(successResult);

      // automationA on "jsearch"
      const firstRunPromise = runCoordinator.requestRun(automationA, schedulerOptions);
      await Promise.resolve();

      // automationB on "eures" — different module, no contention
      const resultB = await runCoordinator.requestRun(automationB, schedulerOptions);

      expect(resultB.moduleContention).toBeUndefined();

      releaseA(successResult);
      await firstRunPromise;
    });

    it("does NOT list self in moduleContention (same automationId is already_running guard)", async () => {
      // automationC on "jsearch" is already running
      let releaseA!: (value: RunnerResult) => void;
      mockRunAutomation.mockReturnValueOnce(
        new Promise<RunnerResult>((resolve) => {
          releaseA = resolve;
        }),
      );
      const firstRunPromise = runCoordinator.requestRun(automationA, schedulerOptions);
      await Promise.resolve();

      // A DIFFERENT automation on the same module should not list itself
      mockRunAutomation.mockResolvedValueOnce(successResult);
      const resultC = await runCoordinator.requestRun(automationC, schedulerOptions);

      const selfEntries = (resultC.moduleContention ?? []).filter(
        (e) => e.automationId === automationC.id,
      );
      expect(selfEntries).toHaveLength(0);

      releaseA(successResult);
      await firstRunPromise;
    });
  });

  // ─── State Queries ──────────────────────────────────────────────────────────

  describe("getState()", () => {
    it("returns phase 'idle' and empty runningAutomations when no run is active", () => {
      const state = runCoordinator.getState();

      expect(state.phase).toBe("idle");
      expect(state.runningAutomations).toHaveLength(0);
    });

    it("reflects a running lock in runningAutomations while run is in progress", async () => {
      let release!: (value: RunnerResult) => void;
      mockRunAutomation.mockReturnValueOnce(
        new Promise<RunnerResult>((resolve) => {
          release = resolve;
        }),
      );

      const runPromise = runCoordinator.requestRun(automationA, schedulerOptions);
      await Promise.resolve();

      const state = runCoordinator.getState();
      expect(state.runningAutomations).toHaveLength(1);
      expect(state.runningAutomations[0].automationId).toBe(automationA.id);
      expect(state.runningAutomations[0].runSource).toBe("scheduler");

      release(successResult);
      await runPromise;
    });

    it("removes the lock from runningAutomations after run completes", async () => {
      mockRunAutomation.mockResolvedValue(successResult);

      await runCoordinator.requestRun(automationA, schedulerOptions);

      const state = runCoordinator.getState();
      expect(state.runningAutomations).toHaveLength(0);
    });
  });

  describe("getRunStatus()", () => {
    it("returns null when automation is not running", () => {
      expect(runCoordinator.getRunStatus("nonexistent-id")).toBeNull();
    });

    it("returns RunLock with correct fields while automation is running", async () => {
      let release!: (value: RunnerResult) => void;
      mockRunAutomation.mockReturnValueOnce(
        new Promise<RunnerResult>((resolve) => {
          release = resolve;
        }),
      );

      const runPromise = runCoordinator.requestRun(automationA, manualOptions);
      await Promise.resolve();

      const lock = runCoordinator.getRunStatus(automationA.id);
      expect(lock).not.toBeNull();
      expect(lock!.automationId).toBe(automationA.id);
      expect(lock!.automationName).toBe(automationA.name);
      expect(lock!.runSource).toBe("manual");
      expect(lock!.moduleId).toBe(automationA.jobBoard);
      expect(lock!.userId).toBe(automationA.userId);
      expect(lock!.startedAt).toBeInstanceOf(Date);

      release(successResult);
      await runPromise;
    });

    it("returns null after the run completes", async () => {
      mockRunAutomation.mockResolvedValue(successResult);

      await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(runCoordinator.getRunStatus(automationA.id)).toBeNull();
    });
  });

  describe("getModuleBusy()", () => {
    it("returns empty array when no locks are held for the module", () => {
      expect(runCoordinator.getModuleBusy("jsearch")).toHaveLength(0);
    });

    it("returns locks for the queried moduleId only", async () => {
      let releaseA!: (value: RunnerResult) => void;
      let releaseB!: (value: RunnerResult) => void;
      mockRunAutomation
        .mockReturnValueOnce(new Promise<RunnerResult>((resolve) => { releaseA = resolve; }))
        .mockReturnValueOnce(new Promise<RunnerResult>((resolve) => { releaseB = resolve; }));

      const runAPromise = runCoordinator.requestRun(automationA, schedulerOptions); // jsearch
      const runBPromise = runCoordinator.requestRun(automationB, schedulerOptions); // eures
      await Promise.resolve();

      const jsearchLocks = runCoordinator.getModuleBusy("jsearch");
      const euresLocks = runCoordinator.getModuleBusy("eures");

      expect(jsearchLocks).toHaveLength(1);
      expect(jsearchLocks[0].automationId).toBe(automationA.id);

      expect(euresLocks).toHaveLength(1);
      expect(euresLocks[0].automationId).toBe(automationB.id);

      releaseA(successResult);
      releaseB(successResult);
      await Promise.all([runAPromise, runBPromise]);
    });

    it("returns two locks when two automations use the same module concurrently", async () => {
      let releaseA!: (value: RunnerResult) => void;
      let releaseC!: (value: RunnerResult) => void;
      mockRunAutomation
        .mockReturnValueOnce(new Promise<RunnerResult>((resolve) => { releaseA = resolve; }))
        .mockReturnValueOnce(new Promise<RunnerResult>((resolve) => { releaseC = resolve; }));

      const runAPromise = runCoordinator.requestRun(automationA, schedulerOptions); // jsearch
      const runCPromise = runCoordinator.requestRun(automationC, schedulerOptions); // jsearch
      await Promise.resolve();

      const jsearchLocks = runCoordinator.getModuleBusy("jsearch");
      expect(jsearchLocks).toHaveLength(2);

      releaseA(successResult);
      releaseC(successResult);
      await Promise.all([runAPromise, runCPromise]);
    });
  });

  // ─── Scheduler Cycle Lifecycle ──────────────────────────────────────────────

  describe("startCycle()", () => {
    it("transitions phase from 'idle' to 'running'", () => {
      runCoordinator.startCycle([automationA, automationB]);

      expect(runCoordinator.getState().phase).toBe("running");

      runCoordinator.completeCycle();
    });

    it("populates pendingAutomations with 1-indexed queue positions", () => {
      runCoordinator.startCycle([automationA, automationB, automationC]);

      const { pendingAutomations } = runCoordinator.getState();
      expect(pendingAutomations).toHaveLength(3);
      expect(pendingAutomations[0]).toMatchObject({
        automationId: automationA.id,
        automationName: automationA.name,
        position: 1,
        total: 3,
      });
      expect(pendingAutomations[1].position).toBe(2);
      expect(pendingAutomations[2].position).toBe(3);

      runCoordinator.completeCycle();
    });

    it("sets cycleStartedAt to a recent Date", () => {
      const before = new Date();
      runCoordinator.startCycle([automationA]);

      const { cycleStartedAt } = runCoordinator.getState();
      const after = new Date();

      expect(cycleStartedAt).toBeInstanceOf(Date);
      expect(cycleStartedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cycleStartedAt!.getTime()).toBeLessThanOrEqual(after.getTime());

      runCoordinator.completeCycle();
    });

    it("resets lastCycleProcessedCount and lastCycleFailedCount to 0", () => {
      // First cycle with failures
      runCoordinator.startCycle([automationA]);
      runCoordinator.completeCycle();

      // Second cycle should start fresh
      runCoordinator.startCycle([automationA]);
      const state = runCoordinator.getState();
      expect(state.lastCycleProcessedCount).toBe(0);
      expect(state.lastCycleFailedCount).toBe(0);

      runCoordinator.completeCycle();
    });
  });

  describe("completeCycle()", () => {
    it("transitions phase to 'idle'", () => {
      runCoordinator.startCycle([automationA]);
      runCoordinator.completeCycle();

      expect(runCoordinator.getState().phase).toBe("idle");
    });

    it("sets lastCycleCompletedAt to a recent Date", () => {
      runCoordinator.startCycle([automationA]);
      const before = new Date();
      runCoordinator.completeCycle();
      const after = new Date();

      const { lastCycleCompletedAt } = runCoordinator.getState();
      expect(lastCycleCompletedAt).toBeInstanceOf(Date);
      expect(lastCycleCompletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastCycleCompletedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("clears pendingAutomations after cycle ends", () => {
      runCoordinator.startCycle([automationA, automationB]);
      runCoordinator.completeCycle();

      expect(runCoordinator.getState().pendingAutomations).toHaveLength(0);
    });

    it("resets cycleStartedAt to null after completion", () => {
      runCoordinator.startCycle([automationA]);
      runCoordinator.completeCycle();

      expect(runCoordinator.getState().cycleStartedAt).toBeNull();
    });
  });

  // ─── Queue Position Tracking ────────────────────────────────────────────────

  describe("queue position tracking", () => {
    it("removes an automation from the queue after its run completes", async () => {
      runCoordinator.startCycle([automationA, automationB]);
      mockRunAutomation.mockResolvedValue(successResult);

      await runCoordinator.requestRun(automationA, schedulerOptions);

      const { pendingAutomations } = runCoordinator.getState();
      const ids = pendingAutomations.map((q) => q.automationId);
      expect(ids).not.toContain(automationA.id);

      runCoordinator.completeCycle();
    });

    it("decrements position of remaining automations after one completes", async () => {
      runCoordinator.startCycle([automationA, automationB, automationC]);
      mockRunAutomation.mockResolvedValue(successResult);

      // automationA is position 1; after its run, automationB and automationC
      // should shift from positions 2 and 3 down to 1 and 2
      await runCoordinator.requestRun(automationA, schedulerOptions);

      const { pendingAutomations } = runCoordinator.getState();
      expect(pendingAutomations).toHaveLength(2);
      expect(pendingAutomations[0].automationId).toBe(automationB.id);
      expect(pendingAutomations[0].position).toBe(1);
      expect(pendingAutomations[1].automationId).toBe(automationC.id);
      expect(pendingAutomations[1].position).toBe(2);

      runCoordinator.completeCycle();
    });

    it("getQueuePosition() returns null when automation is not in the queue", () => {
      runCoordinator.startCycle([automationA]);

      expect(runCoordinator.getQueuePosition("unknown-id")).toBeNull();

      runCoordinator.completeCycle();
    });

    it("getQueuePosition() returns the correct position entry for a queued automation", () => {
      runCoordinator.startCycle([automationA, automationB]);

      const pos = runCoordinator.getQueuePosition(automationB.id);
      expect(pos).not.toBeNull();
      expect(pos!.position).toBe(2);
      expect(pos!.total).toBe(2);

      runCoordinator.completeCycle();
    });
  });

  // ─── Progress Reporting ─────────────────────────────────────────────────────

  describe("reportProgress() / getActiveProgress()", () => {
    it("stores progress for a running automation", async () => {
      let release!: (value: RunnerResult) => void;
      mockRunAutomation.mockReturnValueOnce(
        new Promise<RunnerResult>((resolve) => {
          release = resolve;
        }),
      );

      const runPromise = runCoordinator.requestRun(automationA, schedulerOptions);
      await Promise.resolve();

      const progress: RunProgress = {
        automationId: automationA.id,
        runId: "run-001",
        phase: "search",
        jobsSearched: 10,
        jobsDeduplicated: 3,
        jobsProcessed: 7,
        jobsMatched: 5,
        jobsSaved: 5,
        startedAt: new Date(),
        updatedAt: new Date(),
      };

      runCoordinator.reportProgress(automationA.id, progress);

      const stored = runCoordinator.getActiveProgress(automationA.id);
      expect(stored).toEqual(progress);

      release(successResult);
      await runPromise;
    });

    it("returns null for an automation that has not reported any progress", () => {
      expect(runCoordinator.getActiveProgress("never-ran-id")).toBeNull();
    });

    it("ignores reportProgress calls for automations that are not running", () => {
      const progress: RunProgress = {
        automationId: "ghost-id",
        runId: "run-ghost",
        phase: "save",
        jobsSearched: 0,
        jobsDeduplicated: 0,
        jobsProcessed: 0,
        jobsMatched: 0,
        jobsSaved: 0,
        startedAt: new Date(),
        updatedAt: new Date(),
      };

      runCoordinator.reportProgress("ghost-id", progress);

      // Nothing should have been stored
      expect(runCoordinator.getActiveProgress("ghost-id")).toBeNull();
    });

    it("clears progress after the run completes", async () => {
      mockRunAutomation.mockResolvedValue(successResult);

      let release!: (value: RunnerResult) => void;
      mockRunAutomation.mockReturnValueOnce(
        new Promise<RunnerResult>((resolve) => {
          release = resolve;
        }),
      );

      const runPromise = runCoordinator.requestRun(automationA, schedulerOptions);
      await Promise.resolve();

      runCoordinator.reportProgress(automationA.id, {
        automationId: automationA.id,
        runId: "run-002",
        phase: "match",
        jobsSearched: 5,
        jobsDeduplicated: 1,
        jobsProcessed: 4,
        jobsMatched: 2,
        jobsSaved: 2,
        startedAt: new Date(),
        updatedAt: new Date(),
      });

      release(successResult);
      await runPromise;

      expect(runCoordinator.getActiveProgress(automationA.id)).toBeNull();
    });
  });

  // ─── Cycle Statistics ───────────────────────────────────────────────────────

  describe("cycle statistics", () => {
    it("increments lastCycleProcessedCount for each completed run", async () => {
      runCoordinator.startCycle([automationA, automationB]);
      mockRunAutomation.mockResolvedValue(successResult);

      await runCoordinator.requestRun(automationA, schedulerOptions);
      await runCoordinator.requestRun(automationB, schedulerOptions);

      expect(runCoordinator.getState().lastCycleProcessedCount).toBe(2);

      runCoordinator.completeCycle();
    });

    it("increments lastCycleFailedCount when runnerResult.status is 'failed'", async () => {
      runCoordinator.startCycle([automationA]);
      mockRunAutomation.mockResolvedValue({
        runId: "run-fail",
        status: "failed",
        jobsSearched: 0,
        jobsDeduplicated: 0,
        jobsProcessed: 0,
        jobsMatched: 0,
        jobsSaved: 0,
      });

      await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(runCoordinator.getState().lastCycleFailedCount).toBe(1);

      runCoordinator.completeCycle();
    });

    it("increments lastCycleFailedCount when runAutomation throws", async () => {
      runCoordinator.startCycle([automationA]);
      mockRunAutomation.mockRejectedValue(new Error("fatal error"));

      await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(runCoordinator.getState().lastCycleFailedCount).toBe(1);

      runCoordinator.completeCycle();
    });

    it("does NOT increment lastCycleFailedCount for a 'completed' status", async () => {
      runCoordinator.startCycle([automationA]);
      mockRunAutomation.mockResolvedValue(successResult); // status: 'completed'

      await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(runCoordinator.getState().lastCycleFailedCount).toBe(0);

      runCoordinator.completeCycle();
    });
  });

  // ─── Domain Events ──────────────────────────────────────────────────────────

  describe("domain events — AutomationRunStarted", () => {
    it("emits AutomationRunStarted immediately after lock is acquired", async () => {
      mockRunAutomation.mockResolvedValue(successResult);

      await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(mockCreateEvent).toHaveBeenCalledWith(
        DomainEventType.AutomationRunStarted,
        expect.objectContaining({
          automationId: automationA.id,
          userId: automationA.userId,
          moduleId: automationA.jobBoard,
          runSource: "scheduler",
        }),
      );
    });

    it("passes the created event to emitEvent", async () => {
      const fakeEvent = { type: DomainEventType.AutomationRunStarted, timestamp: new Date(), payload: {} };
      mockCreateEvent.mockReturnValueOnce(fakeEvent as any).mockReturnValue(fakeEvent as any);
      mockRunAutomation.mockResolvedValue(successResult);

      await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(mockEmitEvent).toHaveBeenCalledWith(fakeEvent);
    });
  });

  describe("domain events — AutomationRunCompleted", () => {
    it("emits AutomationRunCompleted after lock is released on success", async () => {
      mockRunAutomation.mockResolvedValue(successResult);

      await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(mockCreateEvent).toHaveBeenCalledWith(
        DomainEventType.AutomationRunCompleted,
        expect.objectContaining({
          automationId: automationA.id,
          userId: automationA.userId,
          moduleId: automationA.jobBoard,
          runSource: "scheduler",
          status: "completed",
          jobsSaved: successResult.jobsSaved,
        }),
      );
    });

    it("emits AutomationRunCompleted with status 'failed' and jobsSaved 0 when runner throws", async () => {
      mockRunAutomation.mockRejectedValue(new Error("boom"));

      await runCoordinator.requestRun(automationA, schedulerOptions);

      expect(mockCreateEvent).toHaveBeenCalledWith(
        DomainEventType.AutomationRunCompleted,
        expect.objectContaining({
          automationId: automationA.id,
          status: "failed",
          jobsSaved: 0,
        }),
      );
    });

    it("includes a non-negative durationMs in the completed event payload", async () => {
      mockRunAutomation.mockResolvedValue(successResult);

      await runCoordinator.requestRun(automationA, schedulerOptions);

      const completedCall = mockCreateEvent.mock.calls.find(
        (args) => args[0] === DomainEventType.AutomationRunCompleted,
      );
      expect(completedCall).toBeDefined();
      const payload = completedCall![1] as { durationMs: number };
      expect(payload.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("domain events — SchedulerCycleStarted", () => {
    it("emits SchedulerCycleStarted when startCycle() is called", () => {
      runCoordinator.startCycle([automationA, automationB]);

      expect(mockCreateEvent).toHaveBeenCalledWith(
        DomainEventType.SchedulerCycleStarted,
        expect.objectContaining({
          queueDepth: 2,
          automationIds: [automationA.id, automationB.id],
        }),
      );

      runCoordinator.completeCycle();
    });

    it("passes the SchedulerCycleStarted event to emitEvent", () => {
      const fakeEvent = { type: DomainEventType.SchedulerCycleStarted, timestamp: new Date(), payload: {} };
      mockCreateEvent.mockReturnValueOnce(fakeEvent as any);

      runCoordinator.startCycle([automationA]);

      expect(mockEmitEvent).toHaveBeenCalledWith(fakeEvent);

      runCoordinator.completeCycle();
    });
  });

  describe("domain events — SchedulerCycleCompleted", () => {
    it("emits SchedulerCycleCompleted when completeCycle() is called", () => {
      runCoordinator.startCycle([automationA]);
      mockCreateEvent.mockClear();

      runCoordinator.completeCycle();

      expect(mockCreateEvent).toHaveBeenCalledWith(
        DomainEventType.SchedulerCycleCompleted,
        expect.objectContaining({
          processedCount: expect.any(Number),
          failedCount: expect.any(Number),
          skippedCount: 0,
          durationMs: expect.any(Number),
        }),
      );
    });

    it("reflects correct processedCount and failedCount in the completed event", async () => {
      runCoordinator.startCycle([automationA, automationB]);
      mockRunAutomation
        .mockResolvedValueOnce(successResult)
        .mockResolvedValueOnce({
          runId: "run-fail",
          status: "failed" as const,
          jobsSearched: 0,
          jobsDeduplicated: 0,
          jobsProcessed: 0,
          jobsMatched: 0,
          jobsSaved: 0,
        });

      await runCoordinator.requestRun(automationA, schedulerOptions);
      await runCoordinator.requestRun(automationB, schedulerOptions);

      mockCreateEvent.mockClear();
      runCoordinator.completeCycle();

      expect(mockCreateEvent).toHaveBeenCalledWith(
        DomainEventType.SchedulerCycleCompleted,
        expect.objectContaining({
          processedCount: 2,
          failedCount: 1,
        }),
      );
    });
  });

  // ─── reconcileOrphanedRuns ──────────────────────────────────────────────────

  describe("reconcileOrphanedRuns()", () => {
    it("calls automationRun.updateMany with status 'running' filter and 'failed' patch", async () => {
      (mockPrisma.automationRun.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await reconcileOrphanedRuns();

      expect(mockPrisma.automationRun.updateMany).toHaveBeenCalledWith({
        where: { status: "running" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "process_restart",
        }),
      });
    });

    it("sets completedAt to a Date in the patch data", async () => {
      (mockPrisma.automationRun.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      await reconcileOrphanedRuns();

      const call = (mockPrisma.automationRun.updateMany as jest.Mock).mock.calls[0][0];
      expect(call.data.completedAt).toBeInstanceOf(Date);
    });

    it("resolves without error when no orphaned runs exist", async () => {
      (mockPrisma.automationRun.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(reconcileOrphanedRuns()).resolves.toBeUndefined();
    });

    it("resolves without error when multiple orphaned runs are patched", async () => {
      (mockPrisma.automationRun.updateMany as jest.Mock).mockResolvedValue({ count: 7 });

      await expect(reconcileOrphanedRuns()).resolves.toBeUndefined();
    });
  });
});
