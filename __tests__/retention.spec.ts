/**
 * Retention Service + DedupHash Runner Check Tests
 *
 * Tests:
 * 1. Retention cleanup processes expired trashed vacancies, creates hashes,
 *    deletes records
 * 2. Retention cleanup processes expired dismissed vacancies
 * 3. Retention cleanup skips vacancies within retention period
 * 4. Retention cleanup processes in batches
 * 5. DedupHash check: runner dedup logic skips known hashes
 *
 * Sprint 2 H-P-05: retention.service.ts was refactored from a per-row
 * `upsert` + `delete` loop to a `findMany` + `createMany` + `deleteMany`
 * batch pattern. These tests mock the batched surface.
 */

import { computeDedupHash } from "@/lib/connector/job-discovery/utils";
import { eventBus } from "@/lib/events/event-bus";
import type { DomainEvent } from "@/lib/events/event-types";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockStagedFindMany = jest.fn();
const mockDedupFindMany = jest.fn();
const mockCreateMany = jest.fn();
const mockCreate = jest.fn();
const mockDeleteMany = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    stagedVacancy: {
      findMany: (...args: unknown[]) => mockStagedFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    dedupHash: {
      findMany: (...args: unknown[]) => mockDedupFindMany(...args),
      createMany: (...args: unknown[]) => mockCreateMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// We need to bypass "server-only" for testing
jest.mock("server-only", () => ({}));

// Import after mocks
import { runRetentionCleanup } from "@/lib/vacancy-pipeline/retention.service";

describe("RetentionService", () => {
  const userId = "test-user-id";
  const retentionDays = 30;

  beforeEach(() => {
    // `mockReset` clears both the call history AND any queued
    // `mockResolvedValueOnce` values. `clearAllMocks` does NOT drain the
    // Once queue, which caused tests that did not consume all their Once
    // values (e.g. when the batch loop broke early) to leak those values
    // into subsequent tests. Use `reset` + re-establish defaults below.
    mockStagedFindMany.mockReset();
    mockDedupFindMany.mockReset();
    mockCreateMany.mockReset();
    mockCreate.mockReset();
    mockDeleteMany.mockReset();
    eventBus.reset();

    // Defaults: no pre-existing hashes, createMany and deleteMany succeed.
    // Also: if a test doesn't override, `findMany` returns [] so the loop
    // breaks cleanly instead of returning undefined.
    mockStagedFindMany.mockResolvedValue([]);
    mockDedupFindMany.mockResolvedValue([]);
    mockCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
      count: Array.isArray(data) ? data.length : 0,
    }));
    mockDeleteMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => ({
      count: where.id.in.length,
    }));
  });

  describe("runRetentionCleanup", () => {
    it("processes expired trashed vacancies, creates hashes, deletes records", async () => {
      const trashedVacancy = {
        id: "sv-trashed-1",
        sourceBoard: "eures",
        externalId: "eures-123",
      };

      // First call returns the batch, second returns empty (done)
      mockStagedFindMany
        .mockResolvedValueOnce([trashedVacancy])
        .mockResolvedValueOnce([]);

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(1);
      expect(result.hashesCreated).toBe(1);

      // Exactly one createMany call, with the expected hash payload
      expect(mockCreateMany).toHaveBeenCalledTimes(1);
      const createCall = mockCreateMany.mock.calls[0][0];
      expect(createCall.data).toEqual([
        {
          userId,
          hash: computeDedupHash("eures", "eures-123"),
          sourceBoard: "eures",
        },
      ]);

      // Exactly one deleteMany call, scoped by id and userId
      expect(mockDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["sv-trashed-1"] },
          userId,
        },
      });
    });

    it("processes expired dismissed vacancies", async () => {
      const dismissedVacancy = {
        id: "sv-dismissed-1",
        sourceBoard: "arbeitsagentur",
        externalId: "aa-456",
      };

      mockStagedFindMany.mockResolvedValueOnce([dismissedVacancy]);
      // First page returned 1 row (< BATCH_SIZE) so the loop exits after
      // this page without a second findMany. No mock needed for page 2.

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(1);
      expect(result.hashesCreated).toBe(1);
      expect(mockCreateMany).toHaveBeenCalledTimes(1);
      expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    });

    it("skips vacancies within retention period (findMany returns empty)", async () => {
      mockStagedFindMany.mockResolvedValueOnce([]);

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(0);
      expect(result.hashesCreated).toBe(0);
      expect(mockCreateMany).not.toHaveBeenCalled();
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    it("de-duplicates against existing hashes before createMany", async () => {
      // Page with 2 rows, one of which has a hash that already exists
      const existingExternalId = "eures-seen";
      const newExternalId = "eures-new";
      const existingHash = computeDedupHash("eures", existingExternalId);

      mockStagedFindMany.mockResolvedValueOnce([
        { id: "sv-1", sourceBoard: "eures", externalId: existingExternalId },
        { id: "sv-2", sourceBoard: "eures", externalId: newExternalId },
      ]);

      // Pre-existing hash lookup returns the "seen" hash
      mockDedupFindMany.mockResolvedValueOnce([{ hash: existingHash }]);

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(2);
      // Only the NEW hash is inserted
      expect(result.hashesCreated).toBe(1);
      const createArgs = mockCreateMany.mock.calls[0][0];
      expect(createArgs.data).toHaveLength(1);
      expect(createArgs.data[0].hash).toBe(
        computeDedupHash("eures", newExternalId),
      );
    });

    it("collapses in-batch hash duplicates before createMany", async () => {
      // Two rows with the same (sourceBoard, externalId) — e.g., two trashed
      // copies of the same job. createMany must see the hash only once so
      // the unique constraint is not violated.
      mockStagedFindMany.mockResolvedValueOnce([
        { id: "sv-a", sourceBoard: "eures", externalId: "dup-1" },
        { id: "sv-b", sourceBoard: "eures", externalId: "dup-1" },
      ]);

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(2);
      expect(result.hashesCreated).toBe(1);
      expect(mockCreateMany).toHaveBeenCalledTimes(1);
      expect(mockCreateMany.mock.calls[0][0].data).toHaveLength(1);
    });

    it("handles vacancies without externalId (no hash created)", async () => {
      const noExternalIdVacancy = {
        id: "sv-no-ext",
        sourceBoard: "manual",
        externalId: null,
      };

      mockStagedFindMany.mockResolvedValueOnce([noExternalIdVacancy]);

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(1);
      expect(result.hashesCreated).toBe(0);
      expect(mockCreateMany).not.toHaveBeenCalled();
      expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    });

    it("emits RetentionCompleted event", async () => {
      const received: DomainEvent[] = [];
      eventBus.subscribe("RetentionCompleted", (event) => {
        received.push(event);
      });

      mockStagedFindMany.mockResolvedValueOnce([
        { id: "sv-1", sourceBoard: "eures", externalId: "ext-1" },
      ]);

      await runRetentionCleanup(userId, retentionDays);

      // emitEvent is fire-and-forget, wait a tick
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(received).toHaveLength(1);
      expect(received[0].payload).toEqual({
        userId,
        purgedCount: 1,
        hashesCreated: 1,
      });
    });

    it("correctly computes retention cutoff date", async () => {
      mockStagedFindMany.mockResolvedValueOnce([]);

      await runRetentionCleanup(userId, retentionDays);

      const callArgs = mockStagedFindMany.mock.calls[0][0];
      expect(callArgs.where.userId).toBe(userId);
      expect(callArgs.where.OR).toBeDefined();

      const trashedCondition = callArgs.where.OR[0];
      expect(trashedCondition.trashedAt.not).toBeNull();
      expect(trashedCondition.trashedAt.lt).toBeInstanceOf(Date);

      const dismissedCondition = callArgs.where.OR[1];
      expect(dismissedCondition.status).toBe("dismissed");
      expect(dismissedCondition.updatedAt.lt).toBeInstanceOf(Date);
    });

    it("H-P-05 regression guard: batched writes scale O(pages), not O(rows)", async () => {
      // Simulate a single full page (500 rows) followed by a partial page.
      //
      // With BATCH_SIZE=500 and WRITE_CHUNK=300, the new implementation
      // should issue per page:
      //   - 1 × findMany on StagedVacancy
      //   - 1 × findMany on DedupHash (pre-filter existing hashes)
      //   - ceil(pageRows / WRITE_CHUNK) × createMany
      //   - ceil(pageRows / WRITE_CHUNK) × deleteMany
      //
      // For this test:
      //   page 1 (500 rows) → 2 createMany + 2 deleteMany
      //   page 2 (1 row)    → 1 createMany + 1 deleteMany
      //   => 3 createMany + 3 deleteMany total
      //   vs the old implementation's 2·501 = 1002 round-trips.
      const fullBatch = Array.from({ length: 500 }, (_, i) => ({
        id: `sv-full-${i}`,
        sourceBoard: "eures",
        externalId: `ext-full-${i}`,
      }));
      const tail = [
        { id: "sv-tail-1", sourceBoard: "eures", externalId: "ext-tail-1" },
      ];

      mockStagedFindMany
        .mockResolvedValueOnce(fullBatch)
        .mockResolvedValueOnce(tail);

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(501);
      expect(result.hashesCreated).toBe(501);

      // findMany was called twice on StagedVacancy (the full page + the tail
      // that exits the loop because length < BATCH_SIZE).
      expect(mockStagedFindMany).toHaveBeenCalledTimes(2);

      // Per-page chunking: 500-row page → 2 chunks, 1-row page → 1 chunk
      expect(mockCreateMany).toHaveBeenCalledTimes(3);
      expect(mockDeleteMany).toHaveBeenCalledTimes(3);

      // Hard upper bound: total write round-trips must stay O(pages), not O(N).
      // For 501 rows the old implementation issued 1002 round-trips. Ours
      // must stay well under one hundred.
      const totalWriteCalls =
        mockCreateMany.mock.calls.length + mockDeleteMany.mock.calls.length;
      expect(totalWriteCalls).toBeLessThan(20);
    });
  });
});

describe("DedupHash check in runner dedup logic", () => {
  it("computeDedupHash produces consistent SHA-256 hashes", () => {
    const hash1 = computeDedupHash("eures", "job-123");
    const hash2 = computeDedupHash("eures", "job-123");
    const hashDifferentBoard = computeDedupHash("arbeitsagentur", "job-123");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDifferentBoard);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("runner skips known hashes via dedup filter", () => {
    const knownHashes = new Set([
      computeDedupHash("eures", "seen-job-1"),
      computeDedupHash("eures", "seen-job-2"),
    ]);

    const jobs = [
      { externalId: "seen-job-1", sourceBoard: "eures" },
      { externalId: "new-job-3", sourceBoard: "eures" },
      { externalId: "seen-job-2", sourceBoard: "eures" },
      { externalId: "new-job-4", sourceBoard: "eures" },
    ];

    const filtered = jobs.filter((job) => {
      if (
        job.externalId &&
        knownHashes.has(computeDedupHash(job.sourceBoard, job.externalId))
      ) {
        return false;
      }
      return true;
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.map((j) => j.externalId)).toEqual(["new-job-3", "new-job-4"]);
  });
});
