import "server-only";

import db from "@/lib/db";
import { computeDedupHash } from "@/lib/connector/job-discovery/utils";
import { emitEvent } from "@/lib/events";

const BATCH_SIZE = 100;

export interface RetentionResult {
  purgedCount: number;
  hashesCreated: number;
}

/**
 * Retention cleanup: finds expired StagedVacancies (trashed or dismissed beyond
 * the retention window), extracts dedup hashes, and deletes the records.
 *
 * Privacy by Design (DSGVO): only a one-way SHA-256 hash is retained after deletion.
 *
 * Spec: specs/vacancy-pipeline.allium (rule RetentionCleanup)
 */
export async function runRetentionCleanup(
  userId: string,
  retentionDays: number,
): Promise<RetentionResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  let purgedCount = 0;
  let hashesCreated = 0;

  // Process in batches to avoid blocking
  while (true) {
    const batch = await db.stagedVacancy.findMany({
      where: {
        userId,
        OR: [
          // Trashed items older than retention period
          {
            trashedAt: { not: null, lt: cutoff },
          },
          // Dismissed items older than retention period
          {
            status: "dismissed",
            updatedAt: { lt: cutoff },
          },
        ],
      },
      take: BATCH_SIZE,
      select: {
        id: true,
        sourceBoard: true,
        externalId: true,
      },
    });

    if (batch.length === 0) break;

    for (const vacancy of batch) {
      // Compute hash only if externalId is present
      if (vacancy.externalId) {
        const hash = computeDedupHash(vacancy.sourceBoard, vacancy.externalId);

        // Upsert into DedupHash (userId + hash unique)
        await db.dedupHash.upsert({
          where: {
            userId_hash: { userId, hash },
          },
          update: {}, // no-op if already exists
          create: {
            userId,
            hash,
            sourceBoard: vacancy.sourceBoard,
          },
        });
        hashesCreated++;
      }

      // Delete the StagedVacancy record
      await db.stagedVacancy.delete({
        where: { id: vacancy.id },
      });
      purgedCount++;
    }

    // Yield between batches to avoid blocking the event loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Emit domain event
  emitEvent({
    type: "RetentionCompleted",
    timestamp: new Date(),
    payload: {
      userId,
      purgedCount,
      hashesCreated,
    },
  });

  return { purgedCount, hashesCreated };
}
