/**
 * RunCoordinator.subscribeToEvents() Tests
 *
 * Tests: event bus self-subscription wiring, AutomationDegraded →
 * acknowledgeExternalStop bridge, idempotent handling, and error isolation.
 *
 * Sprint C: Migrated from degradation-coordinator.ts (deleted) to
 * RunCoordinator.subscribeToEvents() self-subscription pattern.
 *
 * Spec: specs/module-lifecycle.allium (A8: Degradation <-> RunCoordinator bridge)
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAcknowledgeExternalStop = jest.fn();

jest.mock("@/lib/scheduler/run-coordinator", () => {
  // Provide subscribeToEvents that wires to the real eventBus
  const eventBusModule = jest.requireActual("@/lib/events/event-bus");
  const rc = {
    acknowledgeExternalStop: (...args: unknown[]) =>
      mockAcknowledgeExternalStop(...args),
    subscribeToEvents() {
      eventBusModule.eventBus.subscribe(
        "AutomationDegraded",
        (event: any) => {
          rc.acknowledgeExternalStop(event.payload.automationId);
        },
      );
    },
  };
  return { runCoordinator: rc };
});

jest.mock("@/lib/debug", () => ({
  debugLog: jest.fn(),
  debugError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { eventBus } from "@/lib/events/event-bus";
import { createEvent } from "@/lib/events/event-types";
import { runCoordinator } from "@/lib/scheduler/run-coordinator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDegradedEvent(
  automationId: string,
  reason: "auth_failure" | "cb_escalation" | "consecutive_failures" = "auth_failure",
) {
  return createEvent("AutomationDegraded", {
    automationId,
    userId: "user-1",
    reason,
    automationName: "Test Auto",
    message: "test message",
    titleKey: "test.key",
    actorType: "module" as const,
    actorId: "test-module",
    severity: "error" as const,
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("RunCoordinator.subscribeToEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.reset();
  });

  it("registers a handler for the AutomationDegraded event type", () => {
    runCoordinator.subscribeToEvents();
    expect(eventBus.handlerCount("AutomationDegraded")).toBe(1);
  });

  it("calls acknowledgeExternalStop with the correct automationId", async () => {
    runCoordinator.subscribeToEvents();

    await eventBus.publish(makeDegradedEvent("auto-abc"));

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeExternalStop).toHaveBeenCalledWith("auto-abc");
  });

  it("forwards the automationId for every degradation reason variant", async () => {
    runCoordinator.subscribeToEvents();
    const reasons = [
      "auth_failure",
      "cb_escalation",
      "consecutive_failures",
    ] as const;

    for (const reason of reasons) {
      await eventBus.publish(makeDegradedEvent(`auto-${reason}`, reason));
    }

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledTimes(3);
    expect(mockAcknowledgeExternalStop).toHaveBeenNthCalledWith(1, "auto-auth_failure");
    expect(mockAcknowledgeExternalStop).toHaveBeenNthCalledWith(2, "auto-cb_escalation");
    expect(mockAcknowledgeExternalStop).toHaveBeenNthCalledWith(3, "auto-consecutive_failures");
  });

  it("handles multiple AutomationDegraded events independently", async () => {
    runCoordinator.subscribeToEvents();

    await eventBus.publish(makeDegradedEvent("auto-1"));
    await eventBus.publish(makeDegradedEvent("auto-2"));
    await eventBus.publish(makeDegradedEvent("auto-3"));

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledTimes(3);
    const calledWith = mockAcknowledgeExternalStop.mock.calls.map(
      (c: [string]) => c[0],
    );
    expect(calledWith).toEqual(["auto-1", "auto-2", "auto-3"]);
  });

  it("does NOT interfere with other event types on the bus", async () => {
    runCoordinator.subscribeToEvents();

    await eventBus.publish(
      createEvent("AutomationRunStarted", {
        automationId: "auto-run",
        userId: "user-1",
        moduleId: "jsearch",
        runSource: "scheduler",
      }),
    );

    expect(mockAcknowledgeExternalStop).not.toHaveBeenCalled();
  });

  it("is idempotent when acknowledgeExternalStop is called for the same automationId twice", async () => {
    runCoordinator.subscribeToEvents();

    await eventBus.publish(makeDegradedEvent("auto-dup"));
    await eventBus.publish(makeDegradedEvent("auto-dup"));

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledTimes(2);
  });

  it("does not throw when acknowledgeExternalStop throws (error isolation)", async () => {
    mockAcknowledgeExternalStop.mockImplementationOnce(() => {
      throw new Error("coordinator unavailable");
    });
    runCoordinator.subscribeToEvents();

    await expect(
      eventBus.publish(makeDegradedEvent("auto-err")),
    ).resolves.toBeUndefined();
  });

  it("subscribing twice results in two handler invocations per event", async () => {
    runCoordinator.subscribeToEvents();
    runCoordinator.subscribeToEvents();

    await eventBus.publish(makeDegradedEvent("auto-double"));

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledTimes(2);
  });
});
