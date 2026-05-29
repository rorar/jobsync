/**
 * Data Migration: Normalize Person.addressCountry free-text → addressCountryCode
 *
 * For each Person where addressCountry is set but addressCountryCode is null,
 * attempts to resolve the free-text country name to an ISO 3166-1 alpha-2 code
 * using GeoCodeService.normalizeCountry().
 *
 * Idempotent: the query only selects rows where addressCountryCode IS NULL,
 * so re-running never re-processes already-migrated rows.
 * ADR-015: includes userId in all where clauses.
 * Per-row failures are isolated (logged + counted) so one bad update does not
 * abort the whole batch.
 *
 * Usage:        npx tsx scripts/migrate-person-address-country-codes.ts
 * Dry run:      DRY_RUN=1 npx tsx scripts/migrate-person-address-country-codes.ts
 *
 * Note: normalizeCountry is intentionally re-implemented here (not imported from
 * the GeoCode module) because the module carries `import "server-only"`, which
 * throws outside the Next.js runtime. The logic is a faithful copy of
 * geo-codes/countries.ts:normalizeCountry — keep them in sync if that changes.
 */
import { PrismaClient } from "@prisma/client";

// Direct import of normalizeCountry to avoid server-only guard
// (this script runs in CLI context, not in Next.js)
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import deLocale from "i18n-iso-countries/langs/de.json";
import frLocale from "i18n-iso-countries/langs/fr.json";
import esLocale from "i18n-iso-countries/langs/es.json";

countries.registerLocale(enLocale);
countries.registerLocale(deLocale);
countries.registerLocale(frLocale);
countries.registerLocale(esLocale);

const SUPPORTED_LOCALES = new Set(["en", "de", "fr", "es"]);

function normalizeCountry(input: string): string | null {
  if (!input || input.trim().length === 0) return null;
  const trimmed = input.trim();

  if (trimmed.length === 2 && countries.isValid(trimmed.toUpperCase())) {
    return trimmed.toUpperCase();
  }

  if (trimmed.length === 3) {
    const alpha2 = countries.alpha3ToAlpha2(trimmed.toUpperCase());
    if (alpha2) return alpha2;
  }

  if (/^\d{1,3}$/.test(trimmed)) {
    const alpha2 = countries.numericToAlpha2(trimmed.padStart(3, "0"));
    if (alpha2) return alpha2;
  }

  for (const lang of SUPPORTED_LOCALES) {
    const alpha2 = countries.getAlpha2Code(trimmed, lang);
    if (alpha2) return alpha2;
  }

  return null;
}

const prisma = new PrismaClient();

async function main() {
  // Get all persons with addressCountry set but no addressCountryCode
  const persons = await prisma.person.findMany({
    where: {
      addressCountry: { not: null },
      addressCountryCode: null,
    },
    select: {
      id: true,
      userId: true,
      addressCountry: true,
    },
  });

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  console.log(
    `Found ${persons.length} persons to migrate.${dryRun ? " (DRY RUN — no writes)" : ""}`,
  );

  let migrated = 0;
  let unresolvable = 0;
  let errored = 0;

  for (const person of persons) {
    const code = normalizeCountry(person.addressCountry!);
    if (!code) {
      unresolvable++;
      console.log(`  ✗ ${person.id}: "${person.addressCountry}" — could not resolve`);
      continue;
    }
    try {
      if (!dryRun) {
        // ADR-015: userId in where clause
        await prisma.person.update({
          where: { id: person.id, userId: person.userId },
          data: { addressCountryCode: code },
        });
      }
      migrated++;
      console.log(`  ${dryRun ? "○" : "✓"} ${person.id}: "${person.addressCountry}" → ${code}`);
    } catch (err) {
      // Isolate per-row failures so one bad update doesn't abort the batch
      errored++;
      console.error(`  ! ${person.id}: update failed —`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nDone: ${migrated} ${dryRun ? "would migrate" : "migrated"}, ${unresolvable} unresolvable, ${errored} errored.`,
  );
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
