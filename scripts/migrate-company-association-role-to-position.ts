/**
 * Data Migration: Rename CompanyAssociation JSON key `role` → `position`.
 *
 * Welle 5 (Inside Track) Task 1.4. Person.companies is a JSON string (SQLite
 * TEXT) of CompanyAssociation[]. Before the rename the free-text company title
 * was stored under `role`; the spec (crm.allium) now calls it `position`.
 * parseCompanies() reads the legacy key transparently, so this migration is a
 * proactive cleanup — it rewrites stored JSON so the legacy key disappears.
 *
 * Idempotent: only rows whose companies JSON still contains a `role` key are
 * rewritten; `position` wins if both keys exist. ADR-015: userId in the where
 * clause. Per-row failures are isolated.
 *
 * Usage:    bun scripts/migrate-company-association-role-to-position.ts
 * Dry run:  DRY_RUN=1 bun scripts/migrate-company-association-role-to-position.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function rewrite(companiesJson: string): { changed: boolean; next: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(companiesJson);
  } catch {
    return { changed: false, next: companiesJson };
  }
  if (!Array.isArray(parsed)) return { changed: false, next: companiesJson };

  let changed = false;
  const migrated = parsed.map((c) => {
    if (c && typeof c === "object" && "role" in c) {
      changed = true;
      const { role, ...rest } = c as Record<string, unknown>;
      return { ...rest, position: rest.position ?? role ?? null };
    }
    return c;
  });
  return { changed, next: JSON.stringify(migrated) };
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

  // SQLite has no JSON key operators in Prisma's filter API, so pull rows whose
  // companies text mentions "role" and filter precisely in JS.
  const persons = await prisma.person.findMany({
    where: { companies: { contains: "\"role\"" } },
    select: { id: true, userId: true, companies: true },
  });

  console.log(
    `Scanning ${persons.length} persons with a possible legacy 'role' key.${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  let migrated = 0;
  let skipped = 0;
  let errored = 0;

  for (const person of persons) {
    if (!person.companies) {
      skipped++;
      continue;
    }
    const { changed, next } = rewrite(person.companies);
    if (!changed) {
      skipped++;
      continue;
    }
    try {
      if (!dryRun) {
        await prisma.person.update({
          where: { id: person.id, userId: person.userId },
          data: { companies: next },
        });
      }
      migrated++;
      console.log(`  ${dryRun ? "○" : "✓"} ${person.id}: companies role → position`);
    } catch (err) {
      errored++;
      console.error(`  ! ${person.id}: update failed —`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nDone: ${migrated} ${dryRun ? "would migrate" : "migrated"}, ${skipped} skipped, ${errored} errored.`,
  );
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
