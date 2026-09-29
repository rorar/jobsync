/**
 * W-D3: pruning CRM notes orphaned by a target deletion.
 *
 * CrmNoteTarget/CrmTaskTarget cascade-delete with their target Person, Company
 * or Job. A NOTE whose only target was that entity is then unreachable — every
 * note read goes through a target filter — so it is residue and is pruned.
 *
 * A TASK is not: the board lists tasks unfiltered and renders the zero-target
 * case, and the overdue cron selects on status+dueDate alone. Deleting one would
 * also bypass `rule DeleteTask` (crm.allium), which permits a hard delete only
 * for terminal tasks. Tasks must survive with no targets.
 *
 * The prune is scoped to notes that actually pointed at the deleted entity, so
 * one delete cannot reap residue left behind by an unrelated one.
 */

// orphan-targets.ts is server-only; jest resolves the real package, which throws.
jest.mock("server-only", () => ({}));

import {
  collectOrphanCandidateNoteIds,
  pruneOrphanedCrmNotesByIds,
  withOrphanedCrmPrune,
} from "@/lib/crm/orphan-targets";

const USER_ID = "user-1";

function fakeDb() {
  return {
    crmNote: { deleteMany: jest.fn().mockReturnValue({ __op: "notePrune" }) },
    crmNoteTarget: { findMany: jest.fn().mockResolvedValue([]) },
    crmTask: { deleteMany: jest.fn() },
  };
}

describe("collectOrphanCandidateNoteIds", () => {
  it("scopes the caller's target predicate to the owning user via note.userId", async () => {
    const db = fakeDb();

    await collectOrphanCandidateNoteIds(db as never, USER_ID, { targetJobId: "job-1" });

    // CrmNoteTarget has no userId column of its own (ADR-015).
    expect(db.crmNoteTarget.findMany).toHaveBeenCalledWith({
      where: { targetJobId: "job-1", note: { userId: USER_ID } },
      select: { noteId: true },
    });
  });

  it("de-duplicates notes that target the entity more than once", async () => {
    const db = fakeDb();
    db.crmNoteTarget.findMany.mockResolvedValue([
      { noteId: "n1" },
      { noteId: "n2" },
      { noteId: "n1" },
    ]);

    await expect(
      collectOrphanCandidateNoteIds(db as never, USER_ID, { targetJobId: "job-1" }),
    ).resolves.toEqual(["n1", "n2"]);
  });
});

describe("withOrphanedCrmPrune", () => {
  it("appends the note prune after the caller's operations", () => {
    const db = fakeDb();
    const del = { __op: "delete" };

    const ops = withOrphanedCrmPrune(db as never, USER_ID, ["n1"], [del as never]);

    expect(ops).toHaveLength(2);
    expect(ops[0]).toBe(del);
    expect(ops[1]).toEqual({ __op: "notePrune" });
  });

  it("keeps the prune last no matter how many operations precede it", () => {
    const db = fakeDb();
    const before = [{ a: 1 }, { b: 2 }, { c: 3 }];

    const ops = withOrphanedCrmPrune(db as never, USER_ID, ["n1"], before as never);

    // The wrapper owns the position, so a caller cannot append past the prune.
    expect(ops).toHaveLength(4);
    expect(ops.slice(0, 3)).toEqual(before);
    expect(ops[3]).toEqual({ __op: "notePrune" });
  });

  it("only reaps the collected candidates, and only if they lost every target", () => {
    const db = fakeDb();

    withOrphanedCrmPrune(db as never, USER_ID, ["n1", "n2"], []);

    expect(db.crmNote.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["n1", "n2"] },
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
  });

  it("never deletes tasks — an orphaned task stays visible on the board", () => {
    const db = fakeDb();

    withOrphanedCrmPrune(db as never, USER_ID, ["n1"], []);

    expect(db.crmTask.deleteMany).not.toHaveBeenCalled();
  });
});

describe("pruneOrphanedCrmNotesByIds", () => {
  it("deletes the collected candidates and returns the count", async () => {
    const db = fakeDb();
    db.crmNote.deleteMany.mockResolvedValue({ count: 3 });

    await expect(
      pruneOrphanedCrmNotesByIds(db as never, USER_ID, ["n1", "n2"]),
    ).resolves.toBe(3);
    expect(db.crmNote.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["n1", "n2"] }, userId: USER_ID, targets: {
            none: {
              OR: [
                { targetPersonId: { not: null } },
                { targetCompanyId: { not: null } },
                { targetJobId: { not: null } },
              ],
            },
          } },
    });
    expect(db.crmTask.deleteMany).not.toHaveBeenCalled();
  });

  it("issues no query when nothing was collected", async () => {
    const db = fakeDb();

    await expect(pruneOrphanedCrmNotesByIds(db as never, USER_ID, [])).resolves.toBe(0);
    expect(db.crmNote.deleteMany).not.toHaveBeenCalled();
  });
});
