/**
 * Data migration: Extract scheduleFrequency from connectorParams JSON
 * into the new Automation.scheduleFrequency column.
 *
 * Run AFTER `prisma migrate dev --name add_schedule_frequency`.
 *
 * Usage:
 *   source scripts/env.sh
 *   npx tsx scripts/migrate-schedule-frequency.ts
 *
 * Idempotent: safe to run multiple times (skips already-migrated rows).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VALID_FREQUENCIES = new Set(["6h", "12h", "daily", "2d", "weekly"]);

async function migrate() {
  console.log("[migrate-schedule-frequency] Starting...");

  // Find all automations that have connectorParams containing scheduleFrequency
  const automations = await prisma.automation.findMany({
    where: {
      connectorParams: { not: null },
    },
    select: {
      id: true,
      connectorParams: true,
      scheduleFrequency: true,
    },
  });

  let migrated = 0;
  let skipped = 0;
  let cleaned = 0;
  let errors = 0;

  for (const automation of automations) {
    try {
      const params = JSON.parse(automation.connectorParams!);

      // Skip if no scheduleFrequency in connectorParams
      if (!params.scheduleFrequency) {
        skipped++;
        continue;
      }

      const frequency = String(params.scheduleFrequency);

      // Validate the frequency value
      if (!VALID_FREQUENCIES.has(frequency)) {
        console.warn(
          `[migrate-schedule-frequency] Invalid frequency "${frequency}" for automation ${automation.id}, defaulting to "daily"`
        );
      }

      const validFrequency = VALID_FREQUENCIES.has(frequency) ? frequency : "daily";

      // Remove scheduleFrequency from connectorParams
      const { scheduleFrequency: _, ...remainingParams } = params;

      // Determine new connectorParams value
      // If the remaining params are empty, set to null
      const newConnectorParams = Object.keys(remainingParams).length > 0
        ? JSON.stringify(remainingParams)
        : null;

      // Update the automation
      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          scheduleFrequency: validFrequency,
          connectorParams: newConnectorParams,
        },
      });

      migrated++;

      if (newConnectorParams === null && automation.connectorParams !== null) {
        cleaned++;
      }

      console.log(
        `  [${automation.id}] Migrated: scheduleFrequency="${validFrequency}", connectorParams=${newConnectorParams === null ? "null" : "updated"}`
      );
    } catch (err) {
      console.error(
        `[migrate-schedule-frequency] Error processing automation ${automation.id}:`,
        err
      );
      errors++;
    }
  }

  console.log(`[migrate-schedule-frequency] Complete.`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped (no scheduleFrequency in JSON): ${skipped}`);
  console.log(`  Cleaned (connectorParams set to null): ${cleaned}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total processed: ${automations.length}`);
}

migrate()
  .catch((err) => {
    console.error("[migrate-schedule-frequency] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
