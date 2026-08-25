/**
 * @jest-environment node
 */

/**
 * W-D3 — the orphan-note prune against a REAL database.
 *
 * Every other test in this repo mocks Prisma, so nothing verified the parts of
 * this design that only exist at the database layer, and each of them hid a real
 * defect at some point:
 *   - `targets: { none: … }` compiling to a correlated NOT EXISTS that actually
 *     distinguishes "no targets" from "has targets";
 *   - a Prisma array `$transaction` executing in order, which is the whole
 *     reason the prune may be appended last (a mocked $transaction cannot fail
 *     this — the assertion is on array position, not on execution);
 *   - ghost join rows (all three FK columns null) not counting as targets;
 *   - the erasure scrub reaching a note that keeps a second target.
 *
 * The schema is built by replaying the committed migrations in order (~0.7 s),
 * so this needs no Prisma CLI, no new dependency and no fixture database — it
 * cannot drift from `prisma/migrations`.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  collectOrphanCandidateNoteIds,
  withOrphanedCrmPrune,
} from "@/lib/crm/orphan-targets";

const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");

function buildSchemaSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((d) => /^\d/.test(d))
    .sort()
    .map((d) => readFileSync(join(MIGRATIONS_DIR, d, "migration.sql"), "utf8"))
    .join("\n");
}

/** `sqlite3` is present in devenv and on the CI image; skip loudly if it is not. */
function haveSqlite3(): boolean {
  try {
    execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const USER_ID = "user-int-1";
const OTHER_USER_ID = "user-int-2";

let dir: string;
let prisma: PrismaClient;

const sqlite3Available = haveSqlite3();

// A silent skip is the real hazard here: a CI runner without sqlite3 would go
// green while this whole tier never ran. Locally, skipping is the right call —
// the developer sees it reported and nothing else breaks. (ADR-040.)
if (!sqlite3Available && process.env.CI) {
  throw new Error(
    "sqlite3 CLI not found. It is required for the database-backed test tier " +
      "(see docs/adr/040-database-backed-integration-tests.md). Refusing to " +
      "skip silently in CI.",
  );
}

const describeOrSkip = sqlite3Available ? describe : describe.skip;

describeOrSkip("orphan-note prune (real SQLite)", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "jobsync-prune-"));
    const dbPath = join(dir, "test.db");
    execFileSync("sqlite3", [dbPath], { input: buildSchemaSql() });

    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });

    for (const id of [USER_ID, OTHER_USER_ID]) {
      await prisma.user.create({
        data: { id, name: id, email: `${id}@example.test`, password: "x" },
      });
    }
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  /** Fresh company + job per test, so each case owns its cascade. */
  async function makeJob(userId = USER_ID) {
    const suffix = Math.random().toString(36).slice(2, 10);
    const company = await prisma.company.create({
      data: { label: `Co ${suffix}`, value: `co-${suffix}`, createdBy: userId },
    });
    const title = await prisma.jobTitle.create({
      data: { label: `T ${suffix}`, value: `t-${suffix}`, createdBy: userId },
    });
    const category = await prisma.jobStatusCategory.create({
      data: {
        userId,
        kind: `k-${suffix}`,
        label: "K",
        colour: "#000",
        sortOrder: 1,
        isAppliedStage: false,
        isTerminal: false,
        defaultCollapsed: false,
        allowsSelfTransition: false,
      },
    });
    const status = await prisma.jobStatus.create({
      data: { userId, label: `S ${suffix}`, value: `s-${suffix}`, categoryId: category.id },
    });
    const job = await prisma.job.create({
      data: {
        userId,
        companyId: company.id,
        jobTitleId: title.id,
        statusId: status.id,
        description: "",
        jobType: "full_time",
        createdAt: new Date(),
      },
    });
    return { job, company };
  }

  async function noteWithTargets(
    body: string,
    targets: { targetJobId?: string; targetPersonId?: string; targetCompanyId?: string }[],
    userId = USER_ID,
  ) {
    return prisma.crmNote.create({
      data: { userId, body, targets: { create: targets } },
      select: { id: true },
    });
  }

  /** The production call shape: collect, then delete + prune in one transaction. */
  async function deleteJobWithPrune(jobId: string, userId = USER_ID) {
    const candidates = await collectOrphanCandidateNoteIds(prisma, userId, {
      targetJobId: jobId,
    });
    const result = await prisma.$transaction(
      withOrphanedCrmPrune(prisma, userId, candidates, [
        prisma.job.delete({ where: { id: jobId, userId } }),
      ]),
    );
    return (result[result.length - 1] as { count: number }).count;
  }

  it("removes a note whose only target was the deleted job", async () => {
    const { job } = await makeJob();
    const note = await noteWithTargets("only this job", [{ targetJobId: job.id }]);

    const pruned = await deleteJobWithPrune(job.id);

    expect(pruned).toBe(1);
    expect(await prisma.crmNote.findUnique({ where: { id: note.id } })).toBeNull();
  });

  it("keeps a note that still targets something else", async () => {
    const { job, company } = await makeJob();
    const note = await noteWithTargets("job and company", [
      { targetJobId: job.id },
      { targetCompanyId: company.id },
    ]);

    const pruned = await deleteJobWithPrune(job.id);

    // The FK cascade drops the job target row; the company target keeps it alive.
    expect(pruned).toBe(0);
    const kept = await prisma.crmNote.findUnique({
      where: { id: note.id },
      include: { targets: true },
    });
    expect(kept).not.toBeNull();
    expect(kept!.targets).toHaveLength(1);
  });

  it("leaves notes belonging to another user untouched", async () => {
    const { job } = await makeJob();
    const mine = await noteWithTargets("mine", [{ targetJobId: job.id }]);
    // A zero-target note the other user already owns: the prune must not see it,
    // because it is scoped by userId AND by the collected candidate ids.
    const theirs = await prisma.crmNote.create({
      data: { userId: OTHER_USER_ID, body: "theirs" },
      select: { id: true },
    });

    await deleteJobWithPrune(job.id);

    expect(await prisma.crmNote.findUnique({ where: { id: mine.id } })).toBeNull();
    expect(await prisma.crmNote.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });

  it("does not reap a zero-target note left behind by an unrelated delete", async () => {
    // W-D3 scoping: an earlier defect (or an earlier version of this code) can
    // leave residue. Deleting job B must not silently swallow it.
    const stale = await prisma.crmNote.create({
      data: { userId: USER_ID, body: "orphaned earlier" },
      select: { id: true },
    });
    const { job } = await makeJob();
    await noteWithTargets("about job b", [{ targetJobId: job.id }]);

    const pruned = await deleteJobWithPrune(job.id);

    expect(pruned).toBe(1);
    expect(await prisma.crmNote.findUnique({ where: { id: stale.id } })).not.toBeNull();
  });

  it("treats an all-null ghost target row as no target", async () => {
    // The polymorphic FKs were ON DELETE SET NULL before migration
    // 20260512224224, so an older database can hold join rows pointing at
    // nothing. `none: {}` would have called that a target and spared the note.
    const { job } = await makeJob();
    const note = await noteWithTargets("has a ghost", [{ targetJobId: job.id }]);
    await prisma.crmNoteTarget.create({ data: { noteId: note.id } });

    const pruned = await deleteJobWithPrune(job.id);

    expect(pruned).toBe(1);
    expect(await prisma.crmNote.findUnique({ where: { id: note.id } })).toBeNull();
  });

  it("executes the array transaction in order, so the prune sees the cascade", async () => {
    // The ordering the whole design rests on. A mocked $transaction cannot fail
    // this: put the prune FIRST and the note survives, because at that point its
    // target row still exists.
    const { job } = await makeJob();
    const note = await noteWithTargets("ordering", [{ targetJobId: job.id }]);

    const candidates = await collectOrphanCandidateNoteIds(prisma, USER_ID, {
      targetJobId: job.id,
    });
    const [pruneResult] = await prisma.$transaction([
      prisma.crmNote.deleteMany({
        where: {
          id: { in: candidates },
          userId: USER_ID,
          targets: {
            none: {
              OR: [
                { targetPersonId: { not: null } },
                { targetCompanyId: { not: null } },
                { targetJobId: { not: null } },
              ],
            },
          },
        },
      }),
      prisma.job.delete({ where: { id: job.id, userId: USER_ID } }),
    ]);

    expect(pruneResult.count).toBe(0);
    expect(await prisma.crmNote.findUnique({ where: { id: note.id } })).not.toBeNull();

    // And the documented order does remove it.
    expect(await deleteJobWithPruneOnLeftoverNote(note.id)).toBe(1);
  });

  /** The note above is now targetless residue; prune it by id to prove the shape. */
  async function deleteJobWithPruneOnLeftoverNote(noteId: string) {
    const { count } = await prisma.crmNote.deleteMany({
      where: {
        id: { in: [noteId] },
        userId: USER_ID,
        targets: {
          none: {
            OR: [
              { targetPersonId: { not: null } },
              { targetCompanyId: { not: null } },
              { targetJobId: { not: null } },
            ],
          },
        },
      },
    });
    return count;
  }

  it("rolls the prune back with the delete when the transaction fails", async () => {
    const { job } = await makeJob();
    const note = await noteWithTargets("atomicity", [{ targetJobId: job.id }]);

    const candidates = await collectOrphanCandidateNoteIds(prisma, USER_ID, {
      targetJobId: job.id,
    });
    await expect(
      prisma.$transaction(
        withOrphanedCrmPrune(prisma, USER_ID, candidates, [
          prisma.job.delete({ where: { id: job.id, userId: USER_ID } }),
          // Fails: no such job any more. Everything before it must roll back.
          prisma.job.delete({ where: { id: job.id, userId: USER_ID } }),
        ]),
      ),
    ).rejects.toThrow();

    expect(await prisma.crmNote.findUnique({ where: { id: note.id } })).not.toBeNull();
    expect(await prisma.job.findUnique({ where: { id: job.id } })).not.toBeNull();
  });
});
