/**
 * Event Bus Tests
 *
 * Tests: publish/subscribe, error isolation, wildcard, unsubscribe, reset
 * Spec: specs/event-bus.allium
 */

import { eventBus, WILDCARD } from "@/lib/events/event-bus";
import { createEvent } from "@/lib/events/event-types";
import type { DomainEvent } from "@/lib/events/event-types";

describe("TypedEventBus", () => {
  beforeEach(() => {
    eventBus.reset();
  });

  describe("publish/subscribe", () => {
    it("delivers event to subscribed handler", async () => {
      const received: DomainEvent[] = [];
      eventBus.subscribe("VacancyPromoted", (event) => {
        received.push(event);
      });

      const event = createEvent("VacancyPromoted", {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });

      await eventBus.publish(event);

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("VacancyPromoted");
      expect(received[0].payload).toEqual({
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      });
    });

    it("delivers to multiple handlers for the same event type", async () => {
      const handler1Calls: string[] = [];
      const handler2Calls: string[] = [];

      eventBus.subscribe("VacancyDismissed", () => { handler1Calls.push("h1"); });
      eventBus.subscribe("VacancyDismissed", () => { handler2Calls.push("h2"); });

      await eventBus.publish(createEvent("VacancyDismissed", {
        stagedVacancyId: "sv-1",
        userId: "user-1",
      }));

      expect(handler1Calls).toHaveLength(1);
      expect(handler2Calls).toHaveLength(1);
    });

    it("does not deliver events to handlers subscribed to a different type", async () => {
      const received: DomainEvent[] = [];
      eventBus.subscribe("VacancyPromoted", (event) => { received.push(event); });

      await eventBus.publish(createEvent("VacancyDismissed", {
        stagedVacancyId: "sv-1",
        userId: "user-1",
      }));

      expect(received).toHaveLength(0);
    });

    it("supports async handlers", async () => {
      const received: string[] = [];

      eventBus.subscribe("VacancyPromoted", async (event) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        received.push(event.payload.jobId);
      });

      await eventBus.publish(createEvent("VacancyPromoted", {
        stagedVacancyId: "sv-1",
        jobId: "job-async",
        userId: "user-1",
      }));

      expect(received).toEqual(["job-async"]);
    });
  });

  describe("error isolation (spec: ErrorIsolation)", () => {
    it("continues dispatching when a handler throws", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const received: string[] = [];

      eventBus.subscribe("VacancyPromoted", () => {
        throw new Error("Consumer 1 failed");
      });
      eventBus.subscribe("VacancyPromoted", () => {
        received.push("consumer-2");
        return;
      });

      await eventBus.publish(createEvent("VacancyPromoted", {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      }));

      expect(received).toEqual(["consumer-2"]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[EventBus] Consumer failed"),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("publish does not throw even if all handlers fail", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      eventBus.subscribe("VacancyDismissed", () => {
        throw new Error("fail 1");
      });
      eventBus.subscribe("VacancyDismissed", () => {
        throw new Error("fail 2");
      });

      await expect(eventBus.publish(createEvent("VacancyDismissed", {
        stagedVacancyId: "sv-1",
        userId: "user-1",
      }))).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });

    it("isolates async handler rejection", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const received: string[] = [];

      eventBus.subscribe("VacancyPromoted", async () => {
        throw new Error("Async consumer failed");
      });
      eventBus.subscribe("VacancyPromoted", () => {
        received.push("sync-consumer");
        return;
      });

      await eventBus.publish(createEvent("VacancyPromoted", {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      }));

      expect(received).toEqual(["sync-consumer"]);
      consoleSpy.mockRestore();
    });
  });

  describe("wildcard subscription", () => {
    it("receives all event types via wildcard (*)", async () => {
      const received: string[] = [];
      eventBus.subscribe(WILDCARD, (event) => { received.push(event.type); });

      await eventBus.publish(createEvent("VacancyPromoted", {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      }));
      await eventBus.publish(createEvent("VacancyDismissed", {
        stagedVacancyId: "sv-2",
        userId: "user-1",
      }));

      expect(received).toEqual(["VacancyPromoted", "VacancyDismissed"]);
    });
  });

  describe("unsubscribe", () => {
    it("stops receiving events after unsubscribe() call", async () => {
      const received: string[] = [];
      const handler = () => { received.push("called"); };

      const unsub = eventBus.subscribe("VacancyPromoted", handler);

      await eventBus.publish(createEvent("VacancyPromoted", {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      }));
      expect(received).toHaveLength(1);

      unsub();

      await eventBus.publish(createEvent("VacancyPromoted", {
        stagedVacancyId: "sv-2",
        jobId: "job-2",
        userId: "user-1",
      }));
      expect(received).toHaveLength(1);
    });

    it("unsubscribe via method also works", async () => {
      const received: string[] = [];
      const handler = () => { received.push("called"); };

      eventBus.subscribe("VacancyDismissed", handler);
      eventBus.unsubscribe("VacancyDismissed", handler);

      await eventBus.publish(createEvent("VacancyDismissed", {
        stagedVacancyId: "sv-1",
        userId: "user-1",
      }));

      expect(received).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("removes all handlers", async () => {
      eventBus.subscribe("VacancyPromoted", () => { /* noop */ });
      eventBus.subscribe("VacancyDismissed", () => { /* noop */ });
      eventBus.subscribe(WILDCARD, () => { /* noop */ });

      expect(eventBus.handlerCount()).toBe(3);

      eventBus.reset();

      expect(eventBus.handlerCount()).toBe(0);
    });
  });

  describe("createEvent helper", () => {
    it("creates a frozen event with timestamp", () => {
      const event = createEvent("VacancyStaged", {
        stagedVacancyId: "sv-1",
        userId: "user-1",
        sourceBoard: "eures",
        automationId: "auto-1",
      });

      expect(event.type).toBe("VacancyStaged");
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.payload.sourceBoard).toBe("eures");
      expect(Object.isFrozen(event)).toBe(true);
    });
  });

  describe("order guarantee (spec: OrderGuarantee)", () => {
    it("delivers events to handler in publish order", async () => {
      const order: number[] = [];

      eventBus.subscribe("VacancyStaged", (event) => {
        order.push(Number(event.payload.stagedVacancyId));
        return;
      });

      await eventBus.publish(createEvent("VacancyStaged", {
        stagedVacancyId: "1",
        userId: "u",
        sourceBoard: "eures",
        automationId: null,
      }));
      await eventBus.publish(createEvent("VacancyStaged", {
        stagedVacancyId: "2",
        userId: "u",
        sourceBoard: "eures",
        automationId: null,
      }));
      await eventBus.publish(createEvent("VacancyStaged", {
        stagedVacancyId: "3",
        userId: "u",
        sourceBoard: "eures",
        automationId: null,
      }));

      expect(order).toEqual([1, 2, 3]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Sprint 2 H-P-06: parallel consumer dispatch
  // ───────────────────────────────────────────────────────────────────────

  describe("parallel consumer dispatch (H-P-06)", () => {
    it("dispatches all consumers concurrently, not sequentially", async () => {
      // Three 50ms handlers. Sequentially they would take 150ms; in parallel
      // they should complete well under 120ms. We use a 100ms ceiling with
      // a generous buffer to avoid CI flakiness.
      const delay = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));

      eventBus.subscribe("VacancyPromoted", async () => {
        await delay(50);
      });
      eventBus.subscribe("VacancyPromoted", async () => {
        await delay(50);
      });
      eventBus.subscribe("VacancyPromoted", async () => {
        await delay(50);
      });

      const start = Date.now();
      await eventBus.publish(
        createEvent("VacancyPromoted", {
          stagedVacancyId: "sv-1",
          jobId: "job-1",
          userId: "user-1",
        }),
      );
      const elapsed = Date.now() - start;

      // Sequential would be ~150ms; parallel must be much less.
      // Allow plenty of headroom for CI timer drift.
      expect(elapsed).toBeLessThan(120);
    });

    it("publish() still awaits EVERY handler before resolving", async () => {
      // Parallelism must not regress to fire-and-forget: callers still need
      // to observe side-effects after `await publish(...)`.
      const sideEffects: string[] = [];

      eventBus.subscribe("VacancyDismissed", async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        sideEffects.push("slow-handler-done");
      });
      eventBus.subscribe("VacancyDismissed", () => {
        sideEffects.push("sync-handler-done");
      });

      await eventBus.publish(
        createEvent("VacancyDismissed", {
          stagedVacancyId: "sv-1",
          userId: "user-1",
        }),
      );

      // Both handlers must have committed their side-effects by the time
      // publish resolves.
      expect(sideEffects).toContain("slow-handler-done");
      expect(sideEffects).toContain("sync-handler-done");
    });

    it("isolates a rejecting handler from the parallel batch", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const received: string[] = [];

      eventBus.subscribe("VacancyPromoted", async () => {
        throw new Error("parallel reject");
      });
      eventBus.subscribe("VacancyPromoted", async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
        received.push("parallel-survivor");
      });
      eventBus.subscribe("VacancyPromoted", () => {
        received.push("sync-survivor");
      });

      await eventBus.publish(
        createEvent("VacancyPromoted", {
          stagedVacancyId: "sv-1",
          jobId: "job-1",
          userId: "user-1",
        }),
      );

      expect(received).toContain("parallel-survivor");
      expect(received).toContain("sync-survivor");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[EventBus] Consumer failed"),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("preserves per-handler cross-publish ordering (OrderGuarantee)", async () => {
      // Parallel dispatch must NOT break the invariant that publish(A) then
      // publish(B) delivers A before B to every handler.
      const order: string[] = [];

      eventBus.subscribe("VacancyStaged", async (event) => {
        // Variable delay to try to invert ordering if publish was buggy
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        order.push(event.payload.stagedVacancyId);
      });

      await eventBus.publish(
        createEvent("VacancyStaged", {
          stagedVacancyId: "first",
          userId: "u",
          sourceBoard: "eures",
          automationId: null,
        }),
      );
      await eventBus.publish(
        createEvent("VacancyStaged", {
          stagedVacancyId: "second",
          userId: "u",
          sourceBoard: "eures",
          automationId: null,
        }),
      );

      expect(order).toEqual(["first", "second"]);
    });
  });

  describe("handlerCount", () => {
    it("returns count for specific event type", () => {
      eventBus.subscribe("VacancyPromoted", () => { /* noop */ });
      eventBus.subscribe("VacancyPromoted", () => { /* noop */ });
      eventBus.subscribe("VacancyDismissed", () => { /* noop */ });

      expect(eventBus.handlerCount("VacancyPromoted")).toBe(2);
      expect(eventBus.handlerCount("VacancyDismissed")).toBe(1);
      expect(eventBus.handlerCount("VacancyArchived")).toBe(0);
    });

    it("returns total count without argument", () => {
      eventBus.subscribe("VacancyPromoted", () => { /* noop */ });
      eventBus.subscribe("VacancyDismissed", () => { /* noop */ });
      eventBus.subscribe(WILDCARD, () => { /* noop */ });

      expect(eventBus.handlerCount()).toBe(3);
    });
  });
});

describe("emitEvent backward compatibility", () => {
  const { emitEvent } = require("@/lib/events");

  beforeEach(() => {
    eventBus.reset();
  });

  it("emitEvent publishes through the bus", async () => {
    const received: string[] = [];
    eventBus.subscribe("VacancyPromoted", (event) => {
      received.push(event.type);
      return;
    });

    emitEvent({
      type: "VacancyPromoted",
      timestamp: new Date(),
      payload: {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      },
    });

    // emitEvent is fire-and-forget, give the async bus a tick
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual(["VacancyPromoted"]);
  });
});
