/**
 * Per-user JobStatus seeding (Welle 4, F-AJ-09).
 *
 * Idempotently seeds a user's seven stage categories + the eight default
 * statuses, and resolves a user's default status. Reused by the signup path
 * (replaces the old global jobStatus seed), the DB seed script, the migration's
 * spirit, and the automation default-status resolvers (which were user-blind and
 * self-created GLOBAL rows — a cross-tenant / NOT-NULL hazard once statuses are
 * per-user).
 *
 * Takes the Prisma client (or a transaction client) as a parameter so it works
 * from server actions, the standalone seed script, and inside transactions.
 *
 * Spec: specs/job-status.allium (rule SeedDefaultStatusSet).
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { CATEGORY_SEED, DEFAULT_STATUS_SEED, STATUS_CATEGORY_KINDS } from "./status-categories";

/** Accepts the full client or a transaction client. */
type SeedDb = Pick<PrismaClient, "jobStatusCategory" | "jobStatus"> | Prisma.TransactionClient;

/**
 * Seed (idempotently) the user's stage categories + default statuses. Safe to
 * re-run: categories upsert by (userId, kind), statuses by (userId, value).
 */
export async function seedJobStatusesForUser(db: SeedDb, userId: string): Promise<void> {
  const categoryIdByKind: Record<string, string> = {};

  for (const kind of STATUS_CATEGORY_KINDS) {
    const seed = CATEGORY_SEED[kind];
    const category = await db.jobStatusCategory.upsert({
      where: { userId_kind: { userId, kind } },
      update: {},
      create: {
        userId,
        kind,
        label: seed.label,
        colour: seed.colour,
        sortOrder: seed.sortOrder,
        isAppliedStage: seed.isAppliedStage,
        isTerminal: seed.isTerminal,
        defaultCollapsed: seed.defaultCollapsed,
        allowsSelfTransition: seed.allowsSelfTransition,
      },
    });
    categoryIdByKind[kind] = category.id;
  }

  for (const status of DEFAULT_STATUS_SEED) {
    await db.jobStatus.upsert({
      where: { userId_value: { userId, value: status.value } },
      update: {},
      create: {
        userId,
        categoryId: categoryIdByKind[status.kind],
        label: status.label,
        value: status.value,
        sortOrder: status.sortOrder,
        isDefault: status.isDefault,
      },
    });
  }
}

/**
 * Resolve a user's default status (is_default, else lowest sortOrder). Seeds the
 * user's set first if they have none yet. Always userId-scoped (ADR-015) — never
 * touches another user's statuses, never creates a global row.
 */
export async function getDefaultJobStatusForUser(
  db: SeedDb,
  userId: string,
): Promise<{ id: string; value: string }> {
  const find = () =>
    db.jobStatus.findFirst({
      where: { userId, isDefault: true },
      select: { id: true, value: true },
    });

  let status = await find();
  if (!status) {
    await seedJobStatusesForUser(db, userId);
    status = await find();
  }
  if (!status) {
    status = await db.jobStatus.findFirst({
      where: { userId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, value: true },
    });
  }
  if (!status) {
    throw new Error(`Failed to resolve a default JobStatus for user ${userId}`);
  }
  return status;
}
