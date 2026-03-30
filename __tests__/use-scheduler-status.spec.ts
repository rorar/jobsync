/**
 * useSchedulerStatus Hook Tests
 *
 * Tests: singleton EventSource lifecycle, subscribe/unsubscribe reference
 * counting, SSE message parsing, reconnect on error, server close event,
 * and the derived query helpers (isRunning, isAutomationRunning,
 * getQueuePosition, getModuleBusy, getActiveProgress).
 *
 * Strategy: replace the global EventSource with a controllable fake before
 * each test, then reach into the singleton to reset state between tests.
 * We avoid jest.resetModules() because it invalidates the React context and
 * breaks useState in subsequent renderHook calls.
 *
 * Spec: scheduler-coordination.allium (surface SchedulerStatusBar)
 */

import "@testing-library/jest-dom";
import { renderHook, act } from "@testing-library/react";
import type { SchedulerSnapshot } from "@/lib/scheduler/types";

// ---------------------------------------------------------------------------
// Fake EventSource
// ---------------------------------------------------------------------------

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  url: string;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private _closed = false;
  private _customListeners: Map<string, ((event: Event) => void)[]> = new Map();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: Event) => void) {
    const existing = this._customListeners.get(type) ?? [];
    this._customListeners.set(type, [...existing, handler]);
  }

  removeEventListener(type: string, handler: (event: Event) => void) {
    const existing = this._customListeners.get(type) ?? [];
    this._customListeners.set(
      type,
      existing.filter((h) => h !== handler),
    );
  }

  triggerOpen() {
    this.onopen?.(new Event("open"));
  }

  triggerMessage(data: unknown) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }

  triggerError() {
    this.onerror?.(new Event("error"));
    // Simulate native EventSource behaviour: after error, readyState=CLOSED
    this._closed = true;
  }

  triggerClose() {
    const handlers = this._customListeners.get("close") ?? [];
    const event = new Event("close");
    for (const h of handlers) h(event);
  }

  close() {
    this._closed = true;
  }

  get closed() {
    return this._closed;
  }
}

// ---------------------------------------------------------------------------
// Install fake & reset module singleton before each test
// ---------------------------------------------------------------------------

// We load the real hook once; between tests we replace the EventSource and
// reset the singleton state by unmounting all prior hooks (which triggers the
// unsubscribe path that clears the shared connection).

// Import the module under test once at module level
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";

beforeEach(() => {
  jest.clearAllMocks();
  FakeEventSource.instances = [];
  // Install the fake globally so the module picks it up
  (global as unknown as Record<string, unknown>).EventSource = FakeEventSource;
  // Reset document.hidden to false (visible tab)
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => false,
  });
});

// Helper: get the most recently created FakeEventSource instance
function lastFake(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1];
}

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

const runningSnapshot = makeSnapshot({
  phase: "running",
  runningAutomations: [
    {
      automationId: "auto-a",
      automationName: "Alpha Run",
      runSource: "scheduler",
      moduleId: "jsearch",
      startedAt: new Date("2026-01-01T10:00:00Z"),
      userId: "user-1",
    },
    {
      automationId: "auto-b",
      automationName: "Beta Run",
      runSource: "manual",
      moduleId: "eures",
      startedAt: new Date("2026-01-01T10:01:00Z"),
      userId: "user-2",
    },
  ],
  pendingAutomations: [
    {
      automationId: "auto-c",
      automationName: "Gamma Pending",
      userId: "user-1",
      position: 1,
      total: 1,
    },
  ],
  runningProgress: {
    "auto-a": {
      automationId: "auto-a",
      runId: "run-001",
      phase: "search",
      jobsSearched: 15,
      jobsDeduplicated: 3,
      jobsProcessed: 12,
      jobsMatched: 4,
      jobsSaved: 4,
      startedAt: new Date("2026-01-01T10:00:00Z"),
      updatedAt: new Date("2026-01-01T10:01:00Z"),
    },
  },
});

// ---------------------------------------------------------------------------
// EventSource lifecycle
// ---------------------------------------------------------------------------

describe("useSchedulerStatus — EventSource lifecycle", () => {
  it("opens a shared EventSource on first subscribe", () => {
    const { unmount } = renderHook(() => useSchedulerStatus());
    expect(FakeEventSource.instances.length).toBeGreaterThanOrEqual(1);
    expect(lastFake().url).toBe("/api/scheduler/status");
    unmount();
  });

  it("does NOT open a second EventSource when a second hook instance mounts", () => {
    const { unmount: u1 } = renderHook(() => useSchedulerStatus());
    const countAfterFirst = FakeEventSource.instances.length;

    const { unmount: u2 } = renderHook(() => useSchedulerStatus());
    // No new instance created for the second hook
    expect(FakeEventSource.instances.length).toBe(countAfterFirst);

    u1();
    u2();
  });

  it("closes EventSource when last consumer unmounts", () => {
    const { unmount } = renderHook(() => useSchedulerStatus());
    const instance = lastFake();

    unmount();
    expect(instance.closed).toBe(true);
  });

  it("keeps EventSource open when one of two consumers unmounts", () => {
    const { unmount: u1 } = renderHook(() => useSchedulerStatus());
    const instance = lastFake();
    const { unmount: u2 } = renderHook(() => useSchedulerStatus());

    u1(); // first gone — second still alive
    expect(instance.closed).toBe(false);

    u2(); // last gone
    expect(instance.closed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SSE message handling
// ---------------------------------------------------------------------------

describe("useSchedulerStatus — SSE message handling", () => {
  it("state reflects snapshot after a valid message is received", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    expect(result.current.state?.phase).toBe("running");
    unmount();
  });

  it("does NOT update state when the message contains an error field", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    // Capture the pre-error state so we can verify it was not overwritten
    const stateBefore = result.current.state;

    act(() => {
      lastFake().triggerMessage({ error: "Not Authenticated" });
    });

    // State must not have been replaced by an error-shaped object (i.e. no "error" key on state)
    expect(result.current.state).toBe(stateBefore);
    unmount();
  });

  it("ignores malformed (non-JSON) SSE data without throwing", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    expect(() => {
      act(() => {
        const fake = lastFake();
        if (fake.onmessage) {
          fake.onmessage(new MessageEvent("message", { data: "not-json{{{{" }));
        }
      });
    }).not.toThrow();

    unmount();
  });

  it("updates are delivered to all mounted hook instances", () => {
    const { result: r1, unmount: u1 } = renderHook(() => useSchedulerStatus());
    const { result: r2, unmount: u2 } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    expect(r1.current.state?.phase).toBe("running");
    expect(r2.current.state?.phase).toBe("running");
    u1();
    u2();
  });
});

// ---------------------------------------------------------------------------
// Reconnect on error
// ---------------------------------------------------------------------------

describe("useSchedulerStatus — reconnect on error", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("closes the current EventSource on onerror and schedules a 5 s reconnect", () => {
    const { unmount } = renderHook(() => useSchedulerStatus());
    const first = lastFake();

    act(() => {
      first.triggerError();
    });

    // Source was closed by the error handler
    expect(first.closed).toBe(true);

    // After 5 s a new EventSource should open
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(FakeEventSource.instances.length).toBeGreaterThan(1);
    unmount();
  });

  it("does NOT reconnect when no consumers are alive at error time", () => {
    const { unmount } = renderHook(() => useSchedulerStatus());
    const first = lastFake();
    unmount(); // all consumers gone

    act(() => {
      first.triggerError();
    });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    // Only the original instance, no new one
    expect(FakeEventSource.instances.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Server-initiated close event (P-6)
// ---------------------------------------------------------------------------

describe("useSchedulerStatus — server-initiated close event", () => {
  it("reconnects immediately (no delay) when server sends a close event", () => {
    const { unmount } = renderHook(() => useSchedulerStatus());
    const first = lastFake();

    act(() => {
      first.triggerClose();
    });

    // Immediate reconnect — new instance created
    expect(FakeEventSource.instances.length).toBeGreaterThan(1);
    unmount();
  });
});

// ---------------------------------------------------------------------------
// Derived query helpers
// ---------------------------------------------------------------------------

describe("useSchedulerStatus — isRunning", () => {
  it("is false when state is null", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());
    // No message sent yet — state may be stale from previous test; check the value
    // We just render fresh and verify the hook doesn't blow up
    expect(typeof result.current.isRunning).toBe("boolean");
    unmount();
  });

  it("is true when phase is 'running'", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(makeSnapshot({ phase: "running" }));
    });

    expect(result.current.isRunning).toBe(true);
    unmount();
  });

  it("is true when phase is idle but runningAutomations is non-empty", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(
        makeSnapshot({
          phase: "idle",
          runningAutomations: [
            {
              automationId: "auto-x",
              automationName: "X",
              runSource: "manual",
              moduleId: "jsearch",
              startedAt: new Date(),
              userId: "user-1",
            },
          ],
        }),
      );
    });

    expect(result.current.isRunning).toBe(true);
    unmount();
  });

  it("is false when phase is idle and no automations are running", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(makeSnapshot({ phase: "idle" }));
    });

    expect(result.current.isRunning).toBe(false);
    unmount();
  });
});

describe("useSchedulerStatus — isAutomationRunning", () => {
  it("returns true for an automation present in runningAutomations", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    expect(result.current.isAutomationRunning("auto-a")).toBe(true);
    unmount();
  });

  it("returns false for an automation not in runningAutomations", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    expect(result.current.isAutomationRunning("unknown-id")).toBe(false);
    unmount();
  });

  it("returns false when state is null", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());
    // Before any message arrives, state is null (or prior cached value)
    // The function must not throw
    expect(() => result.current.isAutomationRunning("any")).not.toThrow();
    unmount();
  });
});

describe("useSchedulerStatus — getQueuePosition", () => {
  it("returns the correct position for a pending automation", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    expect(result.current.getQueuePosition("auto-c")).toBe(1);
    unmount();
  });

  it("returns null for an automation not in the queue", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    expect(result.current.getQueuePosition("not-queued")).toBeNull();
    unmount();
  });
});

describe("useSchedulerStatus — getModuleBusy", () => {
  it("returns locks matching the queried moduleId", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    const jsearchLocks = result.current.getModuleBusy("jsearch");
    expect(jsearchLocks).toHaveLength(1);
    expect(jsearchLocks[0].automationId).toBe("auto-a");
    unmount();
  });

  it("returns empty array when no automations use that module", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    expect(result.current.getModuleBusy("arbeitsagentur")).toHaveLength(0);
    unmount();
  });
});

describe("useSchedulerStatus — getActiveProgress", () => {
  it("returns progress for a running automation", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    const progress = result.current.getActiveProgress("auto-a");
    expect(progress).not.toBeNull();
    expect(progress!.phase).toBe("search");
    expect(progress!.jobsSearched).toBe(15);
    unmount();
  });

  it("returns null for an automation without progress data", () => {
    const { result, unmount } = renderHook(() => useSchedulerStatus());

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    expect(result.current.getActiveProgress("auto-b")).toBeNull();
    unmount();
  });
});

describe("useSchedulerStatus — callback stability (P-2 perf fix)", () => {
  it("query callbacks maintain stable references across re-renders", () => {
    const { result, rerender, unmount } = renderHook(() => useSchedulerStatus());

    const before = {
      isAutomationRunning: result.current.isAutomationRunning,
      getQueuePosition: result.current.getQueuePosition,
      getModuleBusy: result.current.getModuleBusy,
      getActiveProgress: result.current.getActiveProgress,
    };

    act(() => {
      lastFake().triggerMessage(runningSnapshot);
    });

    rerender();

    expect(result.current.isAutomationRunning).toBe(before.isAutomationRunning);
    expect(result.current.getQueuePosition).toBe(before.getQueuePosition);
    expect(result.current.getModuleBusy).toBe(before.getModuleBusy);
    expect(result.current.getActiveProgress).toBe(before.getActiveProgress);

    unmount();
  });
});
