import "server-only";
import prisma from "@/lib/db";

/**
 * Resolve the JobStatus id a referral-reified Job should land in
 * (TipReifiesToJob, inside-track.allium).
 *
 * JobStatus is per-user and customizable (Welle 4); the delete-guard only
 * protects the last-overall + the default status, NOT one-per-kind — so a user
 * may have zero applied-kind statuses. The fallback contract:
 *   1. a status whose category kind = "applied"
 *   2. else the user's default status (isDefault)
 *   3. else any status (lowest sortOrder)
 * It never returns null: >=1 status always exists per the delete-guard. The
 * impossible zero-status case throws (caller surfaces an i18n error).
 *
 * ADR-015: every query is userId-scoped.
 */
export async function resolveAppliedStatusId(userId: string): Promise<string> {
  const applied = await prisma.jobStatus.findFirst({
    where: { userId, category: { kind: "applied" } },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (applied) return applied.id;

  const fallbackDefault = await prisma.jobStatus.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  });
  if (fallbackDefault) return fallbackDefault.id;

  const any = await prisma.jobStatus.findFirst({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (any) return any.id;

  throw new Error("resolveAppliedStatusId: user has no JobStatus (delete-guard invariant violated)");
}
