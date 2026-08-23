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
 */

import {
  withOrphanedCrmPrune,
  pruneOrphanedCrmNotes,
} from "@/lib/crm/orphan-targets";

const USER_ID = "user-1";

function fakeDb() {
  return {
    crmNote: { deleteMany: jest.fn().mockReturnValue({ __op: "notePrune" }) },
    crmTask: { deleteMany: jest.fn() },
  };
}

describe("withOrphanedCrmPrune", () => {
  it("appends the note prune after the caller's operations", () => {
    const db = fakeDb();
    const del = { __op: "delete" };

    const ops = withOrphanedCrmPrune(db as never, USER_ID, [del as never]);

    expect(ops).toHaveLength(2);
    expect(ops[0]).toBe(del);
    expect(ops[1]).toEqual({ __op: "notePrune" });
  });

  it("keeps the prune last no matter how many operations precede it", () => {
    const db = fakeDb();
    const before = [{ a: 1 }, { b: 2 }, { c: 3 }];

    const ops = withOrphanedCrmPrune(db as never, USER_ID, before as never);

    // The wrapper owns the position, so a caller cannot append past the prune.
    expect(ops).toHaveLength(4);
    expect(ops.slice(0, 3)).toEqual(before);
    expect(ops[3]).toEqual({ __op: "notePrune" });
  });

  it("scopes the prune to the owning user and to zero-target notes only", () => {
    const db = fakeDb();
    withOrphanedCrmPrune(db as never, USER_ID, []);

    expect(db.crmNote.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, targets: { none: {} } },
    });
  });

  it("never deletes tasks — an orphaned task stays visible on the board", () => {
    const db = fakeDb();
    withOrphanedCrmPrune(db as never, USER_ID, []);

    expect(db.crmTask.deleteMany).not.toHaveBeenCalled();
  });
});

describe("pruneOrphanedCrmNotes", () => {
  it("deletes the user's zero-target notes and returns the count", async () => {
    const db = {
      crmNote: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      crmTask: { deleteMany: jest.fn() },
    };

    await expect(pruneOrphanedCrmNotes(db as never, USER_ID)).resolves.toBe(3);
    expect(db.crmNote.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, targets: { none: {} } },
    });
    expect(db.crmTask.deleteMany).not.toHaveBeenCalled();
  });
});
