/**
 * L-S-04: enrichment-trigger.ts queue length bound
 *
 * Verifies that withEnrichmentLimit drops incoming tasks with a console.warn
 * when enrichmentQueue.length >= MAX_ENRICHMENT_QUEUE_LENGTH, preventing
 * unbounded memory growth under event storms.
 *
 * Enrichment is best-effort per specs/data-enrichment.allium — dropping is
 * acceptable; the next CompanyCreated event for the same domain retries.
 */

// ---------------------------------------------------------------------------
// Mocks — must come before imports so Jest hoisting works
// ---------------------------------------------------------------------------

jest.mock("server-only", () => ({}));

jest.mock("@/lib/events/event-bus", () => ({
  eventBus: { subscribe: jest.fn(), publish: jest.fn() },
}));

jest.mock("@/lib/events/event-types", () => ({
  DomainEventType: { CompanyCreated: "CompanyCreated", VacancyPromoted: "VacancyPromoted" },
}));

jest.mock("@/lib/connector/data-enrichment/orchestrator", () => ({
  enrichmentOrchestrator: { execute: jest.fn() },
  getChainForDimension: jest.fn(),
}));

jest.mock("@/lib/connector/data-enrichment/logo-writeback", () => ({
  applyLogoWriteback: jest.fn(),
}));

jest.mock("@/lib/connector/data-enrichment/domain-extractor", () => ({
  extractDomain: jest.fn((name: string) => name.toLowerCase()),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    enrichmentResult: { findFirst: jest.fn().mockResolvedValue(null) },
    job: { findFirst: jest.fn() },
  },
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import {
  withEnrichmentLimit,
  enrichmentQueue,
  MAX_CONCURRENT_ENRICHMENTS,
  MAX_ENRICHMENT_QUEUE_LENGTH,
  resetSemaphoreForTesting,
  activeEnrichments,
} from "@/lib/events/consumers/enrichment-trigger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a task that completes only when `release()` is called.
 *
 * The Promise is constructed eagerly (not inside `task()`) so the resolver
 * is captured synchronously. If we constructed the Promise lazily inside
 * `task()`, `release` would still be `undefined!` when the helper returns —
 * the Promise executor only runs when `new Promise(...)` is invoked, and
 * that would be after the destructuring assignment at the call site.
 * Per javascript-testing-patterns "Test async patterns" — fixtures must be
 * fully constructed before the test consumes them.
 */
function controllableTask(): { task: () => Promise<string>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<string>((resolve) => {
    release = () => resolve("done");
  });
  const task = () => promise;
  return { task, release };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("L-S-04: enrichment queue length bound", () => {
  beforeEach(() => {
    resetSemaphoreForTesting();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Drain any lingering queue entries to avoid leaking between tests.
    // Each queued resolve() is safe to call — it just unblocks a pending
    // withEnrichmentLimit call that will immediately see the semaphore free.
    const pending = enrichmentQueue.splice(0);
    pending.forEach((resolve) => resolve());
    resetSemaphoreForTesting();
  });

  it("exports MAX_ENRICHMENT_QUEUE_LENGTH = 200", () => {
    expect(MAX_ENRICHMENT_QUEUE_LENGTH).toBe(200);
  });

  it("drops task and throws when queue is full", async () => {
    // Fill the semaphore slots (MAX_CONCURRENT_ENRICHMENTS = 5)
    // then stuff the queue to exactly MAX_ENRICHMENT_QUEUE_LENGTH.
    // We do this by directly pushing resolve-noop entries into enrichmentQueue —
    // this is the same array withEnrichmentLimit pushes into, so it simulates
    // the state after MAX+MAX_QUEUE concurrent callers have already queued.

    // Occupy all semaphore slots with long-running tasks
    const held: Array<{ release: () => void }> = [];
    const slotDrains: Promise<string>[] = [];
    for (let i = 0; i < MAX_CONCURRENT_ENRICHMENTS; i++) {
      const { task, release } = controllableTask();
      held.push({ release });
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      slotDrains.push(withEnrichmentLimit(task));
    }

    // Now fill the queue to its max
    for (let i = 0; i < MAX_ENRICHMENT_QUEUE_LENGTH; i++) {
      enrichmentQueue.push(() => {}); // placeholder resolve
    }

    // The next withEnrichmentLimit call should be rejected
    await expect(
      withEnrichmentLimit(() => Promise.resolve("should not run"), "test-domain"),
    ).rejects.toThrow("EnrichmentQueue full");

    // console.warn must have been called with the domain
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Queue full"),
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("test-domain"),
    );

    // Release all slot holders to clean up
    held.forEach(({ release }) => release());
    await Promise.allSettled(slotDrains);
  });

  it("does NOT drop tasks while queue has capacity", async () => {
    // One slot occupied, queue empty — next task should queue and eventually run
    const { task: holdingTask, release: releaseSlot } = controllableTask();
    // Fill all slots
    const slotPromises: Promise<string>[] = [];
    for (let i = 0; i < MAX_CONCURRENT_ENRICHMENTS; i++) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      slotPromises.push(withEnrichmentLimit(holdingTask));
    }

    // Queue one task (queue length = 1 < MAX)
    let taskRan = false;
    const queuedPromise = withEnrichmentLimit(async () => {
      taskRan = true;
      return "ran";
    }, "example.com");

    // Should NOT have thrown — queue is not full
    expect(enrichmentQueue.length).toBeLessThan(MAX_ENRICHMENT_QUEUE_LENGTH);
    expect(console.warn).not.toHaveBeenCalled();

    // Release a slot — the queued task should now run
    releaseSlot();
    await queuedPromise;
    expect(taskRan).toBe(true);

    await Promise.allSettled(slotPromises);
  });

  it("console.warn includes 'unknown' when no domain is provided", async () => {
    // Fill slots + queue
    for (let i = 0; i < MAX_CONCURRENT_ENRICHMENTS; i++) {
      // artificially hold a slot
    }
    // Manually set activeEnrichments to max via semaphore hold trick
    // (simpler: just fill the queue directly)
    for (let i = 0; i < MAX_ENRICHMENT_QUEUE_LENGTH; i++) {
      enrichmentQueue.push(() => {});
    }

    // Occupy at least one slot so the queue guard is reached
    // We can't easily do this without the controllable task, so rely on the
    // state of enrichmentQueue.length >= MAX being checked first in withEnrichmentLimit.
    // For this unit test we just verify the queue length check is independent of
    // semaphore state by confirming queue full condition.
    //
    // Actually withEnrichmentLimit checks activeEnrichments FIRST, then queue length.
    // We need activeEnrichments >= MAX. Use the reset + direct queue approach from
    // the previous test instead.
    enrichmentQueue.length = 0; // reset queue
    resetSemaphoreForTesting();

    // Occupy all semaphore slots
    const releases: Array<() => void> = [];
    const slots: Promise<string>[] = [];
    for (let i = 0; i < MAX_CONCURRENT_ENRICHMENTS; i++) {
      const { task, release } = controllableTask();
      releases.push(release);
      slots.push(withEnrichmentLimit(task));
    }

    // Fill queue to max
    for (let i = 0; i < MAX_ENRICHMENT_QUEUE_LENGTH; i++) {
      enrichmentQueue.push(() => {});
    }

    // Call without domain arg
    await expect(withEnrichmentLimit(() => Promise.resolve("x"))).rejects.toThrow();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("unknown"),
    );

    releases.forEach((r) => r());
    await Promise.allSettled(slots);
  });
});
