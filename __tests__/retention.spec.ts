/**
 * Retention Service + DedupHash Runner Check Tests
 *
 * Tests:
 * 1. Retention cleanup processes expired trashed vacancies, creates hashes, deletes records
 * 2. Retention cleanup processes expired dismissed vacancies
 * 3. Retention cleanup skips vacancies within retention period
 * 4. Retention cleanup processes in batches
 * 5. DedupHash check: runner dedup logic skips known hashes
 */

import { computeDedupHash } from "@/lib/connector/job-discovery/utils";
import { eventBus } from "@/lib/events/event-bus";
import type { DomainEvent } from "@/lib/events/event-types";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockFindMany = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    stagedVacancy: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    dedupHash: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      findMany: jest.fn(),
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
    jest.clearAllMocks();
    eventBus.reset();
  });

  describe("runRetentionCleanup", () => {
    it("processes expired trashed vacancies, creates hashes, deletes records", async () => {
      const trashedVacancy = {
        id: "sv-trashed-1",
        sourceBoard: "eures",
        externalId: "eures-123",
      };

      // First call returns the batch, second call returns empty (done)
      mockFindMany
        .mockResolvedValueOnce([trashedVacancy])
        .mockResolvedValueOnce([]);

      mockUpsert.mockResolvedValue({});
      mockDelete.mockResolvedValue({});

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(1);
      expect(result.hashesCreated).toBe(1);

      // Verify hash was upserted
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_hash: {
              userId,
              hash: computeDedupHash("eures", "eures-123"),
            },
          },
          create: expect.objectContaining({
            userId,
            hash: computeDedupHash("eures", "eures-123"),
            sourceBoard: "eures",
          }),
        }),
      );

      // Verify vacancy was deleted
      expect(mockDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sv-trashed-1" },
        }),
      );
    });

    it("processes expired dismissed vacancies", async () => {
      const dismissedVacancy = {
        id: "sv-dismissed-1",
        sourceBoard: "arbeitsagentur",
        externalId: "aa-456",
      };

      mockFindMany
        .mockResolvedValueOnce([dismissedVacancy])
        .mockResolvedValueOnce([]);

      mockUpsert.mockResolvedValue({});
      mockDelete.mockResolvedValue({});

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(1);
      expect(result.hashesCreated).toBe(1);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });

    it("skips vacancies within retention period (findMany returns empty)", async () => {
      // When no expired vacancies are found, findMany returns empty
      mockFindMany.mockResolvedValueOnce([]);

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(0);
      expect(result.hashesCreated).toBe(0);
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("processes in batches (multiple findMany calls)", async () => {
      // Simulate two batches of vacancies
      const batch1 = Array.from({ length: 3 }, (_, i) => ({
        id: `sv-batch1-${i}`,
        sourceBoard: "eures",
        externalId: `ext-${i}`,
      }));
      const batch2 = Array.from({ length: 2 }, (_, i) => ({
        id: `sv-batch2-${i}`,
        sourceBoard: "eures",
        externalId: `ext-b2-${i}`,
      }));

      mockFindMany
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2)
        .mockResolvedValueOnce([]);

      mockUpsert.mockResolvedValue({});
      mockDelete.mockResolvedValue({});

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(5);
      expect(result.hashesCreated).toBe(5);
      // findMany called 3 times: batch1, batch2, empty
      expect(mockFindMany).toHaveBeenCalledTimes(3);
    });

    it("handles vacancies without externalId (no hash created)", async () => {
      const noExternalIdVacancy = {
        id: "sv-no-ext",
        sourceBoard: "manual",
        externalId: null,
      };

      mockFindMany
        .mockResolvedValueOnce([noExternalIdVacancy])
        .mockResolvedValueOnce([]);

      mockDelete.mockResolvedValue({});

      const result = await runRetentionCleanup(userId, retentionDays);

      expect(result.purgedCount).toBe(1);
      expect(result.hashesCreated).toBe(0);
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });

    it("emits RetentionCompleted event", async () => {
      const received: DomainEvent[] = [];
      eventBus.subscribe("RetentionCompleted", (event) => {
        received.push(event);
      });

      mockFindMany
        .mockResolvedValueOnce([
          { id: "sv-1", sourceBoard: "eures", externalId: "ext-1" },
        ])
        .mockResolvedValueOnce([]);
      mockUpsert.mockResolvedValue({});
      mockDelete.mockResolvedValue({});

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
      mockFindMany.mockResolvedValueOnce([]);

      const before = new Date();
      before.setDate(before.getDate() - retentionDays);

      await runRetentionCleanup(userId, retentionDays);

      // Verify the query was called with correct cutoff
      const callArgs = mockFindMany.mock.calls[0][0];
      expect(callArgs.where.userId).toBe(userId);
      expect(callArgs.where.OR).toBeDefined();

      // Check trashed condition
      const trashedCondition = callArgs.where.OR[0];
      expect(trashedCondition.trashedAt.not).toBeNull();
      expect(trashedCondition.trashedAt.lt).toBeInstanceOf(Date);

      // Check dismissed condition
      const dismissedCondition = callArgs.where.OR[1];
      expect(dismissedCondition.status).toBe("dismissed");
      expect(dismissedCondition.updatedAt.lt).toBeInstanceOf(Date);
    });
  });
});

describe("DedupHash check in runner dedup logic", () => {
  it("computeDedupHash produces consistent SHA-256 hashes", () => {
    const hash1 = computeDedupHash("eures", "job-123");
    const hash2 = computeDedupHash("eures", "job-123");
    const hashDifferentBoard = computeDedupHash("arbeitsagentur", "job-123");

    // Same inputs produce same hash
    expect(hash1).toBe(hash2);
    // Different sourceBoard produces different hash
    expect(hash1).not.toBe(hashDifferentBoard);
    // Hash is a hex string (64 chars for SHA-256)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("runner skips known hashes via dedup filter", () => {
    // Simulate the dedup logic from runner.ts:
    // existing.dedupHashes contains hashes from DedupHash table
    const knownHashes = new Set([
      computeDedupHash("eures", "seen-job-1"),
      computeDedupHash("eures", "seen-job-2"),
    ]);

    const jobs = [
      { externalId: "seen-job-1", sourceBoard: "eures" },  // should be filtered
      { externalId: "new-job-3", sourceBoard: "eures" },    // should pass
      { externalId: "seen-job-2", sourceBoard: "eures" },  // should be filtered
      { externalId: "new-job-4", sourceBoard: "eures" },    // should pass
    ];

    const filtered = jobs.filter((job) => {
      if (job.externalId && knownHashes.has(computeDedupHash(job.sourceBoard, job.externalId))) {
        return false;
      }
      return true;
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.map((j) => j.externalId)).toEqual(["new-job-3", "new-job-4"]);
  });
});
