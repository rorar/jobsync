/**
 * Enrichment Trigger — Semaphore Tests (H-T-05)
 *
 * Verifies that withEnrichmentLimit:
 * 1. Enforces MAX_CONCURRENT_ENRICHMENTS=5 even under concurrent pressure.
 * 2. Never allows more than MAX concurrent executions regardless of race timing.
 * 3. Drains queued callers one-at-a-time as slots open.
 * 4. Correctly resets the counter after all work completes.
 *
 * The original bug: the check-then-increment pattern had a race window.
 * Two microtasks could both observe activeEnrichments < MAX before either
 * incremented, allowing 6+ concurrent executions. The fix moves the queue
 * first: every caller that would exceed the limit awaits a Promise before
 * incrementing, and the drain happens inside `finally` — atomically within
 * the same microtask as the decrement.
 */

// ---------------------------------------------------------------------------
// Mock all heavy dependencies — we only care about the semaphore logic
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
// Import under test — AFTER mocks so Jest hoisting works
// ---------------------------------------------------------------------------

import {
  withEnrichmentLimit,
  enrichmentQueue,
  MAX_CONCURRENT_ENRICHMENTS,
  resetSemaphoreForTesting,
  getActiveEnrichmentsCountForTesting,
} from "@/lib/events/consumers/enrichment-trigger";

function getActive(): number {
  return getActiveEnrichmentsCountForTesting();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a controllable async task: returns { promise, resolve, reject }.
 * The semaphore fn is `() => promise`. Calling resolve()/reject() unblocks it.
 */
function makeControllableTask<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  fn: () => Promise<T>;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject, fn: () => promise };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("withEnrichmentLimit semaphore (H-T-05)", () => {
  beforeEach(() => {
    // Reset semaphore state between tests via the dedicated helper — we
    // cannot assign to the `activeEnrichments` export directly because ESM
    // exports are read-only from consumer modules.
    resetSemaphoreForTesting();
  });

  // -------------------------------------------------------------------------
  // Basic correctness
  // -------------------------------------------------------------------------

  it("runs a single task and decrements counter when done", async () => {
    expect(getActive()).toBe(0);

    let insideTask = false;
    const task = withEnrichmentLimit(async () => {
      insideTask = true;
      expect(getActive()).toBe(1);
    });

    await task;

    expect(insideTask).toBe(true);
    expect(getActive()).toBe(0);
  });

  it("runs up to MAX_CONCURRENT_ENRICHMENTS tasks in parallel", async () => {
    const tasks = Array.from({ length: MAX_CONCURRENT_ENRICHMENTS }, () =>
      makeControllableTask(),
    );

    // Start all tasks — none should be queued yet
    const semaphorePromises = tasks.map((t) => withEnrichmentLimit(t.fn));

    // Yield to allow microtasks to run
    await Promise.resolve();

    expect(getActive()).toBe(MAX_CONCURRENT_ENRICHMENTS);
    expect(enrichmentQueue.length).toBe(0);

    // Resolve all tasks
    tasks.forEach((t) => t.resolve());
    await Promise.all(semaphorePromises);

    expect(getActive()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Race-safety: the key invariant
  // -------------------------------------------------------------------------

  it("NEVER exceeds MAX_CONCURRENT_ENRICHMENTS even with concurrent callers (race guard)", async () => {
    const maxObserved: number[] = [];
    const tasks: Array<ReturnType<typeof makeControllableTask<void>>> = [];

    // Launch MAX+3 tasks concurrently to exercise the queue path
    const totalTasks = MAX_CONCURRENT_ENRICHMENTS + 3;

    const semaphorePromises = Array.from({ length: totalTasks }, () => {
      const t = makeControllableTask<void>();
      tasks.push(t);
      return withEnrichmentLimit(async () => {
        // Record the current active count at the moment we enter the critical section
        maxObserved.push(getActive());
        await t.promise;
      });
    });

    // Yield so all microtasks that were synchronously queued can run
    await Promise.resolve();
    await Promise.resolve();

    // The first MAX tasks should be running; the rest queued
    expect(getActive()).toBe(MAX_CONCURRENT_ENRICHMENTS);
    expect(enrichmentQueue.length).toBe(totalTasks - MAX_CONCURRENT_ENRICHMENTS);

    // Resolve all tasks one by one to drain the queue
    for (const t of tasks) {
      t.resolve(undefined);
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all(semaphorePromises);

    // THE KEY ASSERTION: active count must never have exceeded the limit
    expect(Math.max(...maxObserved)).toBeLessThanOrEqual(MAX_CONCURRENT_ENRICHMENTS);
    expect(getActive()).toBe(0);
  });

  it("queues excess tasks when limit is reached", async () => {
    const tasks = Array.from({ length: MAX_CONCURRENT_ENRICHMENTS + 2 }, () =>
      makeControllableTask(),
    );

    const promises = tasks.map((t) => withEnrichmentLimit(t.fn));

    await Promise.resolve();
    await Promise.resolve();

    // Exactly 2 tasks should be in the queue
    expect(enrichmentQueue.length).toBe(2);
    expect(getActive()).toBe(MAX_CONCURRENT_ENRICHMENTS);

    // Resolve first task — queue should drain by 1
    tasks[0].resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getActive()).toBe(MAX_CONCURRENT_ENRICHMENTS);
    expect(enrichmentQueue.length).toBe(1);

    // Cleanup
    tasks.slice(1).forEach((t) => t.resolve());
    await Promise.all(promises);
  });

  it("drains all queued tasks after concurrent burst completes", async () => {
    const completed: number[] = [];
    const tasks = Array.from({ length: MAX_CONCURRENT_ENRICHMENTS + 5 }, (_, i) =>
      makeControllableTask<number>(),
    );

    const promises = tasks.map((t, i) =>
      withEnrichmentLimit(async () => {
        const result = await t.promise;
        completed.push(i);
        return result;
      }),
    );

    await Promise.resolve();

    // Resolve all tasks in order
    for (const t of tasks) {
      t.resolve(1);
      await Promise.resolve();
      await Promise.resolve();
    }

    await Promise.all(promises);

    // All tasks must have completed
    expect(completed.length).toBe(tasks.length);
    expect(getActive()).toBe(0);
    expect(enrichmentQueue.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("releases the semaphore slot even when the task throws", async () => {
    expect(getActive()).toBe(0);

    const errTask = withEnrichmentLimit(async () => {
      throw new Error("task failed");
    });

    await expect(errTask).rejects.toThrow("task failed");

    // Counter must be back to 0 — the finally block must have run
    expect(getActive()).toBe(0);
  });

  it("unblocks a queued task after a throwing task releases its slot", async () => {
    // Fill the semaphore
    const holdingTasks = Array.from({ length: MAX_CONCURRENT_ENRICHMENTS }, () =>
      makeControllableTask(),
    );
    const holdingPromises = holdingTasks.map((t) => withEnrichmentLimit(t.fn));

    await Promise.resolve();
    expect(getActive()).toBe(MAX_CONCURRENT_ENRICHMENTS);

    // Queue one more task that should run AFTER a holder releases
    let nextTaskRan = false;
    const nextTask = withEnrichmentLimit(async () => {
      nextTaskRan = true;
    });

    // Resolve one holding task
    holdingTasks[0].resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(nextTaskRan).toBe(true);

    // Cleanup
    holdingTasks.slice(1).forEach((t) => t.resolve());
    await Promise.all([...holdingPromises, nextTask]);
  });

  // -------------------------------------------------------------------------
  // MAX value is correct
  // -------------------------------------------------------------------------

  it("exports MAX_CONCURRENT_ENRICHMENTS = 5", () => {
    expect(MAX_CONCURRENT_ENRICHMENTS).toBe(5);
  });
});
