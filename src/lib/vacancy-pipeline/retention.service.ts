import "server-only";

import db from "@/lib/db";
import { computeDedupHash } from "@/lib/connector/job-discovery/utils";
import { emitEvent } from "@/lib/events";

// Batch tuning:
//   BATCH_SIZE   — number of rows fetched per findMany page (bounds working set)
//   WRITE_CHUNK  — maximum rows crammed into a single createMany/deleteMany call.
//                  SQLite caps bound parameters via SQLITE_MAX_VARIABLE_NUMBER.
//                  On older builds (< 3.32.0, 2020) the cap is 999; newer
//                  builds raise it to 32766. DedupHash.createMany uses 3
//                  params per row (userId, hash, sourceBoard) → 300 rows is
//                  900 params, safely under the 999 floor. deleteMany uses
//                  1 param per id → well under any cap. This reduces 5000
//                  round-trips to ~17 without risking parameter overflow.
const BATCH_SIZE = 500;
const WRITE_CHUNK = 300;

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
 *
 * Sprint 2 H-P-05 performance fix:
 * The previous implementation ran 2·N sequential Prisma queries per batch
 * (upsert + delete per row). For 5000 expired rows that was ~10 000 round-
 * trips. The new implementation:
 *  1. Fetches a page of up to BATCH_SIZE rows.
 *  2. Computes all hashes in memory.
 *  3. Fetches the subset of those hashes that already exist via ONE
 *     `dedupHash.findMany` (keyed by the unique (userId, hash) constraint).
 *  4. Uses ONE `createMany` for the NEW hashes only.
 *     Note: `skipDuplicates` is not supported by the Prisma SQLite driver,
 *     so we pre-filter against the existing-hash set instead. The narrow
 *     TOCTOU race (two retention sweeps inserting the same hash) is handled
 *     by the unique index — at worst one sweep's createMany call rejects
 *     and we fall back to chunked single inserts within the catch.
 *  5. Uses ONE `deleteMany({ id: { in: ids } })` to purge the rows.
 *  6. Sub-chunks both writes at WRITE_CHUNK to stay under SQLite's SQL
 *     length and parameter-count limits.
 * Result: 5000 expired rows → ~4 round-trips per page × 10 pages = ~40
 * round-trips total, down from ~10 000.
 */
export async function runRetentionCleanup(
  userId: string,
  retentionDays: number,
): Promise<RetentionResult> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  let purgedCount = 0;
  let hashesCreated = 0;

  // Process in batches to avoid blocking the event loop and to keep the
  // working set bounded for users with huge retention backlogs.
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

    // ── Step 1: prepare hash rows in memory ────────────────────────────────
    const hashRows: { userId: string; hash: string; sourceBoard: string }[] = [];
    const idsToDelete: string[] = [];

    for (const vacancy of batch) {
      idsToDelete.push(vacancy.id);
      if (vacancy.externalId) {
        hashRows.push({
          userId,
          hash: computeDedupHash(vacancy.sourceBoard, vacancy.externalId),
          sourceBoard: vacancy.sourceBoard,
        });
      }
    }

    // ── Step 2: de-dupe against existing hashes, then createMany the rest ──
    //
    // SQLite + Prisma does not support `createMany({ skipDuplicates: true })`,
    // so we pre-filter: look up any hashes from this batch that already exist
    // for this user, drop them from the insert set, and `createMany` the
    // remainder. The (userId, hash) @@unique index backs the filter lookup.
    if (hashRows.length > 0) {
      const allHashes = hashRows.map((h) => h.hash);
      const existing = await db.dedupHash.findMany({
        where: { userId, hash: { in: allHashes } },
        select: { hash: true },
      });
      const existingSet = new Set(existing.map((r) => r.hash));

      // Within this batch the same hash can appear twice (two trashed rows
      // for the same external job). Collapse in-memory so createMany does
      // not violate the unique index on its own payload.
      const seen = new Set<string>();
      const freshRows: typeof hashRows = [];
      for (const row of hashRows) {
        if (existingSet.has(row.hash)) continue;
        if (seen.has(row.hash)) continue;
        seen.add(row.hash);
        freshRows.push(row);
      }

      for (const chunk of chunkArray(freshRows, WRITE_CHUNK)) {
        try {
          const result = await db.dedupHash.createMany({ data: chunk });
          hashesCreated += result.count;
        } catch {
          // Narrow TOCTOU race: a concurrent retention sweep inserted one
          // of these hashes between our findMany and our createMany. Fall
          // back to per-row inserts inside a catch so the sweep can still
          // make forward progress. This path is rare and scales with the
          // contention, not with the batch size.
          for (const row of chunk) {
            try {
              await db.dedupHash.create({ data: row });
              hashesCreated += 1;
            } catch {
              // Already present — skip.
            }
          }
        }
      }
    }

    // ── Step 3: delete all rows in one (or a few chunked) deleteMany ──────
    for (const chunk of chunkArray(idsToDelete, WRITE_CHUNK)) {
      const result = await db.stagedVacancy.deleteMany({
        where: {
          id: { in: chunk },
          // Re-assert the IDOR scope on delete even though the ids came from
          // a userId-scoped findMany. Defence in depth.
          userId,
        },
      });
      purgedCount += result.count;
    }

    // Yield between batches to avoid blocking the event loop on long sweeps.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // If we fetched fewer than BATCH_SIZE rows, there can't be another page.
    if (batch.length < BATCH_SIZE) break;
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

/**
 * Split an array into fixed-size chunks. Inlined to avoid pulling in lodash
 * and to keep this file self-contained.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  if (arr.length <= size) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
