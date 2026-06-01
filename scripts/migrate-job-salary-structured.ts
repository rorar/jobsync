/**
 * Data Migration: backfill structured Job salary from the legacy free-text
 * `Job.salaryRange` (Welle 2 Phase 3, F-AJ-05).
 *
 * For each Job where salaryRange is set but the structured fields are still
 * empty, parses salaryRange (bucket id | free-text range | promoter text) via
 * the SHARED, tested parser and writes salaryMin/Max/Currency/Period.
 *
 * NEVER drops data:
 *   - The legacy salaryRange column is RETAINED (deprecated, API back-compat).
 *   - Unparseable values are left as-is (structured stays null, salaryRange kept)
 *     and reported, so nothing is silently lost.
 *
 * Idempotent: only selects rows where salaryMin/Max/Currency are all null, so
 * re-running never re-processes a backfilled row.
 * ADR-015: userId in every where clause. Per-row failures are isolated.
 *
 * Usage:    bun scripts/migrate-job-salary-structured.ts
 * Dry run:  DRY_RUN=1 bun scripts/migrate-job-salary-structured.ts
 */
import { PrismaClient } from "@prisma/client";
import { parseSalaryRange } from "@/lib/salary/parse-salary-range";

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    where: {
      salaryRange: { not: null },
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
    },
    select: { id: true, userId: true, salaryRange: true },
  });

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  console.log(
    `Found ${jobs.length} jobs to backfill.${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  let migrated = 0;
  let unparsed = 0;
  let errored = 0;

  for (const job of jobs) {
    const parsed = parseSalaryRange(job.salaryRange);

    if (parsed.unparsed || (parsed.salaryMin === null && parsed.salaryMax === null)) {
      unparsed++;
      console.log(`  ~ ${job.id}: "${job.salaryRange}" — unparseable, retained as-is`);
      continue;
    }

    try {
      if (!dryRun) {
        await prisma.job.update({
          where: { id: job.id, userId: job.userId },
          data: {
            salaryMin: parsed.salaryMin,
            salaryMax: parsed.salaryMax,
            salaryCurrency: parsed.salaryCurrency,
            salaryPeriod: parsed.salaryPeriod,
          },
        });
      }
      migrated++;
      console.log(
        `  ${dryRun ? "○" : "✓"} ${job.id}: "${job.salaryRange}" → ` +
          `${parsed.salaryMin ?? "·"}–${parsed.salaryMax ?? "·"} ` +
          `${parsed.salaryCurrency ?? ""} ${parsed.salaryPeriod ?? ""}`.trim(),
      );
    } catch (err) {
      errored++;
      console.error(`  ! ${job.id}: update failed —`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nDone: ${migrated} ${dryRun ? "would backfill" : "backfilled"}, ${unparsed} unparseable (retained), ${errored} errored.`,
  );
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
