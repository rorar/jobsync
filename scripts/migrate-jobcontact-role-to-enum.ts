/**
 * Data Migration: Normalize legacy free-text JobContact.role → JobContactRole.
 *
 * Welle 5 (Inside Track) Task 1.3. The JobContact.role column stays `String?`
 * (the controlled vocabulary is enforced app-level — mirrors RelationshipType),
 * so this is a DATA migration, not a schema migration. Each non-conforming
 * value is mapped via mapLegacyContactRole (known string → enum), and anything
 * unmappable is set to null ("unspecified").
 *
 * Idempotent: the query only selects rows whose role is set AND not already a
 * canonical JobContactRole, so re-running never re-processes migrated rows
 * (mapped rows are now canonical; unmappable rows are now null).
 * ADR-015: userId is included in every update where clause.
 * Per-row failures are isolated (logged + counted) so one bad update does not
 * abort the whole batch.
 *
 * Usage:    bun scripts/migrate-jobcontact-role-to-enum.ts
 *           (or: npx tsx scripts/migrate-jobcontact-role-to-enum.ts)
 * Dry run:  DRY_RUN=1 bun scripts/migrate-jobcontact-role-to-enum.ts
 */
import { PrismaClient } from "@prisma/client";
import { JOB_CONTACT_ROLES, mapLegacyContactRole } from "@/models/job.model";

const prisma = new PrismaClient();

async function main() {
  // Idempotent selection: role set, but not already a canonical enum value.
  const rows = await prisma.jobContact.findMany({
    where: {
      role: { not: null, notIn: JOB_CONTACT_ROLES as unknown as string[] },
    },
    select: { id: true, userId: true, role: true },
  });

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  console.log(
    `Found ${rows.length} JobContact rows with non-canonical role.${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  let mapped = 0;
  let nulled = 0;
  let errored = 0;

  for (const row of rows) {
    const next = mapLegacyContactRole(row.role);
    try {
      if (!dryRun) {
        // ADR-015: userId in where clause
        await prisma.jobContact.update({
          where: { id: row.id, userId: row.userId },
          data: { role: next },
        });
      }
      if (next === null) {
        nulled++;
        console.log(`  ${dryRun ? "○" : "✓"} ${row.id}: "${row.role}" → null (unmappable)`);
      } else {
        mapped++;
        console.log(`  ${dryRun ? "○" : "✓"} ${row.id}: "${row.role}" → ${next}`);
      }
    } catch (err) {
      errored++;
      console.error(`  ! ${row.id}: update failed —`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nDone: ${mapped} ${dryRun ? "would map" : "mapped"}, ${nulled} ${dryRun ? "would null" : "nulled"}, ${errored} errored.`,
  );
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
