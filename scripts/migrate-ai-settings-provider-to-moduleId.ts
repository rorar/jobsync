/**
 * Data Migration: Rename settings.ai.provider → settings.ai.moduleId
 *
 * Reads all UserSettings rows, parses the JSON `settings` field,
 * renames `ai.provider` to `ai.moduleId`, and writes back.
 * Idempotent: skips rows that already have `moduleId`.
 *
 * Usage: npx tsx scripts/migrate-ai-settings-provider-to-moduleId.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.userSettings.findMany();
  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    const settings = JSON.parse(row.settings);

    if (!settings.ai) {
      skipped++;
      continue;
    }

    // Already migrated
    if ("moduleId" in settings.ai && !("provider" in settings.ai)) {
      skipped++;
      continue;
    }

    // Rename provider → moduleId
    if ("provider" in settings.ai) {
      settings.ai.moduleId = settings.ai.provider;
      delete settings.ai.provider;

      await prisma.userSettings.update({
        where: { id: row.id },
        data: { settings: JSON.stringify(settings) },
      });
      migrated++;
    } else {
      skipped++;
    }
  }

  console.log(
    `Migration complete: ${migrated} row(s) migrated, ${skipped} row(s) skipped.`,
  );
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
