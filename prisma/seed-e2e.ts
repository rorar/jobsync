/**
 * E2E seed — the fixtures the Playwright suite depends on but never creates.
 *
 * Usage: bun run prisma/seed-e2e.ts   (run AFTER prisma/seed.ts)
 *
 * This exists because of E2E-B30. `e2e/crud/staging-details-sheet.spec.ts`
 * deliberately hard-fails when the seed user has no StagedVacancy — a silent
 * skip there would turn a coverage gap into a green badge — and it tells the
 * reader to run `bun run seed-dev`. That script has never existed. The suite
 * passed anyway, because the developer's working prisma/dev.db happened to hold
 * 56 staged vacancies from ordinary use. That is an ambient dependency, not a
 * fixture: it holds until someone runs the suite on a fresh database, and then
 * it fails naming the test rather than the missing data.
 *
 * Under the disposable-run-database model (specs/e2e-test-infrastructure.allium,
 * DisposableRunDatabase) every run starts from a template built by this file, so
 * anything a spec needs must be declared HERE or the spec is unrunnable. That is
 * the point: a precondition nobody can satisfy by accident.
 *
 * RULES for anything added below:
 *   - Deterministic. No Date.now(), no randomness, no dependence on run order.
 *   - Idempotent. The template build may re-run; upsert or guard on a count.
 *   - No "E2E " prefix. That prefix marks rows the stale-data purge may delete;
 *     seed fixtures must survive it. (The purge disappears with Phase 1b, but
 *     the template must be correct while both exist.)
 *   - Shared infrastructure, read-only to tests: SeedDataReadOnly in the spec.
 *     A fixture a test mutates belongs to that test, not here.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_USER_EMAIL = "admin@example.com";

/**
 * Staged vacancies for the staging specs.
 *
 * Three rather than one: `staging-details-sheet.spec.ts` asserts that opening
 * and closing the sheet does NOT advance the deck position, which is only
 * meaningful when there is somewhere to advance TO. With a single row a broken
 * implementation that advanced past the end would look identical to a correct
 * one that stayed put.
 *
 * Left at the schema defaults `status: "staged"`, `archivedAt: null`,
 * `trashedAt: null`, which is exactly what the "new" tab selects
 * (stagedVacancy.actions.ts:96-99).
 */
/**
 * The activity type `activity-crud.spec.ts` and `task-crud.spec.ts` share.
 *
 * Seeded 2026-09-08, and the reason is a residue-gate argument rather than a
 * convenience. Both specs feed this exact string to a combobox, so the FIRST one
 * to run creates the row and the second reuses it — `createActivityType` upserts
 * on `value_createdBy` (`src/actions/activity.actions.ts:41-45`). The row then
 * survives the run, because neither spec may sweep a name the other is still
 * using, and `scripts/check-e2e-residue.sh` counted it as `ActivityType +1`
 * every run. Once E2E-B44 gave ActivityType a delete path, that +1 was the only
 * thing left standing between the model and an ENFORCED gate entry.
 *
 * Seeding it makes the row part of the template rather than something the run
 * creates, which is what it always was in substance: a precondition two specs
 * depend on and neither owns. The gate then measures a genuine leak instead of a
 * fixture, and the specs get the cheap exact-match path from the first call
 * rather than paying the create path once per run (E2E-B32 measured ~11-25 s
 * for it).
 *
 * `value` must be `label.trim().toLowerCase()` — that is what `createActivityType`
 * computes and upserts on, so any other spelling would produce a SECOND row and
 * quietly reintroduce the +1 this fixture removes.
 */
const SHARED_ACTIVITY_TYPE = {
  label: "E2E Activity Type",
  value: "e2e activity type",
};

const STAGED_VACANCIES = [
  {
    sourceBoard: "eures",
    externalId: "seed-staged-1",
    title: "Frontend Engineer",
    employerName: "Seed Industries",
    location: "Berlin, Germany",
    description:
      "Seed fixture for the staging specs. Not created by any test; see prisma/seed-e2e.ts.",
    matchScore: 82,
  },
  {
    sourceBoard: "eures",
    externalId: "seed-staged-2",
    title: "Backend Developer",
    employerName: "Seed Industries",
    location: "Vienna, Austria",
    description:
      "Seed fixture for the staging specs. Not created by any test; see prisma/seed-e2e.ts.",
    matchScore: 64,
  },
  {
    sourceBoard: "arbeitsagentur",
    externalId: "seed-staged-3",
    title: "Data Analyst",
    employerName: "Seed Analytics",
    location: "Hamburg, Germany",
    description:
      "Seed fixture for the staging specs. Not created by any test; see prisma/seed-e2e.ts.",
    matchScore: null,
  },
];

async function main() {
  console.log("🌱 Seeding E2E fixtures...");

  const user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
    select: { id: true },
  });

  if (!user) {
    // Fail loudly rather than seeding nothing. A template missing its user
    // fails every spec at once, and the error would name the login, not this.
    throw new Error(
      `E2E seed: user ${TEST_USER_EMAIL} not found. Run prisma/seed.ts first — ` +
        `seed-e2e.ts is additive and does not create the user.`,
    );
  }

  // Idempotent by the model's own unique key, so re-running the seed against an
  // existing template is a no-op rather than a duplicate.
  await prisma.activityType.upsert({
    where: {
      value_createdBy: {
        value: SHARED_ACTIVITY_TYPE.value,
        createdBy: user.id,
      },
    },
    update: { label: SHARED_ACTIVITY_TYPE.label },
    create: {
      label: SHARED_ACTIVITY_TYPE.label,
      value: SHARED_ACTIVITY_TYPE.value,
      createdBy: user.id,
    },
  });

  for (const vacancy of STAGED_VACANCIES) {
    // No unique constraint covers (userId, sourceBoard, externalId) — it is an
    // index, not a key (schema.prisma:709) — so upsert is unavailable and the
    // idempotency guard has to be explicit.
    const existing = await prisma.stagedVacancy.findFirst({
      where: {
        userId: user.id,
        sourceBoard: vacancy.sourceBoard,
        externalId: vacancy.externalId,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.stagedVacancy.update({
        where: { id: existing.id },
        data: { ...vacancy, status: "staged", archivedAt: null, trashedAt: null },
      });
    } else {
      await prisma.stagedVacancy.create({
        data: { ...vacancy, userId: user.id },
      });
    }
  }

  console.log(`  ✓ Staged vacancies: ${STAGED_VACANCIES.length}`);
  console.log("✅ E2E fixtures seeded");
}

main()
  .catch((e) => {
    console.error("❌ E2E seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
