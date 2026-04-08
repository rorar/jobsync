/**
 * Data Migration: Rename modules in existing database rows.
 *
 * clearbit → logo_dev (Clearbit Logo API dead since 2025-12-01)
 * esco_api → esco_classification (moved from data-enrichment to reference-data)
 *
 * Run AFTER deploying the code update:
 *   bun run scripts/migrate-module-renames.ts
 *
 * Safe to run multiple times (idempotent — WHERE clause only matches old names).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting module rename migration...");

  // ModuleRegistration: rename moduleId + update connectorType
  const reg1 = await prisma.moduleRegistration.updateMany({
    where: { moduleId: "clearbit" },
    data: { moduleId: "logo_dev", connectorType: "data_enrichment" },
  });
  console.log(`ModuleRegistration: clearbit → logo_dev (${reg1.count} rows)`);

  const reg2 = await prisma.moduleRegistration.updateMany({
    where: { moduleId: "esco_api" },
    data: { moduleId: "esco_classification", connectorType: "reference_data" },
  });
  console.log(`ModuleRegistration: esco_api → esco_classification (${reg2.count} rows)`);

  // EnrichmentResult: update sourceModuleId
  const er1 = await prisma.enrichmentResult.updateMany({
    where: { sourceModuleId: "clearbit" },
    data: { sourceModuleId: "logo_dev" },
  });
  console.log(`EnrichmentResult: clearbit → logo_dev (${er1.count} rows)`);

  // EnrichmentLog: update moduleId
  const el1 = await prisma.enrichmentLog.updateMany({
    where: { moduleId: "clearbit" },
    data: { moduleId: "logo_dev" },
  });
  console.log(`EnrichmentLog: clearbit → logo_dev (${el1.count} rows)`);

  const el2 = await prisma.enrichmentLog.updateMany({
    where: { moduleId: "esco_api" },
    data: { moduleId: "esco_classification" },
  });
  console.log(`EnrichmentLog: esco_api → esco_classification (${el2.count} rows)`);

  console.log("Module rename migration complete.");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
