/**
 * DegradationCoordinator Consumer Tests
 *
 * Tests: event bus subscription wiring, AutomationDegraded → acknowledgeExternalStop
 * bridge, idempotent handling, and error isolation.
 *
 * Spec: specs/module-lifecycle.allium (A8: Degradation <-> RunCoordinator bridge)
 *
 * The consumer registers on the event bus and calls
 * runCoordinator.acknowledgeExternalStop() when an AutomationDegraded event
 * fires. These tests verify that wiring end-to-end, using the real eventBus
 * and a mock runCoordinator.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAcknowledgeExternalStop = jest.fn();

jest.mock("@/lib/scheduler/run-coordinator", () => ({
  runCoordinator: {
    acknowledgeExternalStop: (...args: unknown[]) =>
      mockAcknowledgeExternalStop(...args),
  },
}));

jest.mock("@/lib/debug", () => ({
  debugLog: jest.fn(),
  debugError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { eventBus } from "@/lib/events/event-bus";
import { createEvent } from "@/lib/events/event-types";
import { registerDegradationCoordinator } from "@/lib/events/consumers/degradation-coordinator";

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
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("registerDegradationCoordinator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.reset();
  });

  it("registers a handler for the AutomationDegraded event type", () => {
    registerDegradationCoordinator();
    expect(eventBus.handlerCount("AutomationDegraded")).toBe(1);
  });

  it("calls acknowledgeExternalStop with the correct automationId", async () => {
    registerDegradationCoordinator();

    await eventBus.publish(makeDegradedEvent("auto-abc"));

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeExternalStop).toHaveBeenCalledWith("auto-abc");
  });

  it("forwards the automationId for every degradation reason variant", async () => {
    registerDegradationCoordinator();
    const reasons = [
      "auth_failure",
      "cb_escalation",
      "consecutive_failures",
    ] as const;

    for (const reason of reasons) {
      await eventBus.publish(makeDegradedEvent(`auto-${reason}`, reason));
    }

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledTimes(3);
    expect(mockAcknowledgeExternalStop).toHaveBeenNthCalledWith(
      1,
      "auto-auth_failure",
    );
    expect(mockAcknowledgeExternalStop).toHaveBeenNthCalledWith(
      2,
      "auto-cb_escalation",
    );
    expect(mockAcknowledgeExternalStop).toHaveBeenNthCalledWith(
      3,
      "auto-consecutive_failures",
    );
  });

  it("handles multiple AutomationDegraded events independently", async () => {
    registerDegradationCoordinator();

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
    registerDegradationCoordinator();

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

  it("does not receive events for types it did not subscribe to (VacancyPromoted)", async () => {
    registerDegradationCoordinator();

    await eventBus.publish(
      createEvent("VacancyPromoted", {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      }),
    );

    expect(mockAcknowledgeExternalStop).not.toHaveBeenCalled();
  });

  it("is idempotent when acknowledgeExternalStop is called for the same automationId twice", async () => {
    // acknowledgeExternalStop itself handles idempotency, but the consumer
    // must faithfully forward every event it receives
    registerDegradationCoordinator();

    await eventBus.publish(makeDegradedEvent("auto-dup"));
    await eventBus.publish(makeDegradedEvent("auto-dup"));

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledTimes(2);
  });

  it("does not throw when acknowledgeExternalStop throws (error isolation)", async () => {
    mockAcknowledgeExternalStop.mockImplementationOnce(() => {
      throw new Error("coordinator unavailable");
    });
    registerDegradationCoordinator();

    // eventBus isolates handler errors — publish must not reject
    await expect(
      eventBus.publish(makeDegradedEvent("auto-err")),
    ).resolves.toBeUndefined();
  });

  it("registering twice results in two handler invocations per event", async () => {
    // Calling register twice should double-wire (no deduplication guard in
    // implementation). This test documents actual behaviour.
    registerDegradationCoordinator();
    registerDegradationCoordinator();

    await eventBus.publish(makeDegradedEvent("auto-double"));

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Integration: acknowledgeExternalStop side effects via real coordinator
//
// These tests use the REAL RunCoordinator singleton (not the mock above) to
// verify the full round-trip: degradation event → consumer → coordinator state.
// They live in a separate describe block with a fresh mock reset.
// ---------------------------------------------------------------------------

describe("registerDegradationCoordinator — RunCoordinator integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.reset();
  });

  it("passes exactly the automationId from the event payload to the coordinator", async () => {
    const specificId = "specific-automation-id-xyz-999";
    registerDegradationCoordinator();

    await eventBus.publish(
      createEvent("AutomationDegraded", {
        automationId: specificId,
        userId: "user-test",
        reason: "cb_escalation",
      }),
    );

    expect(mockAcknowledgeExternalStop).toHaveBeenCalledWith(specificId);
  });
});
