/**
 * W-D3: pruning CRM notes/tasks orphaned by a target deletion.
 *
 * CrmNoteTarget/CrmTaskTarget cascade-delete with their target Person, Company
 * or Job. A note/task whose ONLY target was that entity survives with zero
 * targets — invisible on every timeline (reads filter via `targets.some`) yet
 * still holding its free-text body. These helpers remove that residue.
 */

import {
  buildOrphanedCrmPruneOps,
  pruneOrphanedCrmRecords,
} from "@/lib/crm/orphan-targets";

const USER_ID = "user-1";

function fakeDb() {
  return {
    crmNote: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    crmTask: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe("buildOrphanedCrmPruneOps", () => {
  it("builds one note op and one task op, in that order", () => {
    const db = fakeDb();
    const ops = buildOrphanedCrmPruneOps(db as never, USER_ID);

    expect(ops).toHaveLength(2);
    expect(db.crmNote.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.crmTask.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("scopes both ops to the owning user and to zero-target records only", () => {
    const db = fakeDb();
    buildOrphanedCrmPruneOps(db as never, USER_ID);

    const expected = { where: { userId: USER_ID, targets: { none: {} } } };
    expect(db.crmNote.deleteMany).toHaveBeenCalledWith(expected);
    expect(db.crmTask.deleteMany).toHaveBeenCalledWith(expected);
  });

  it("never deletes records that still have a target (no unscoped where)", () => {
    const db = fakeDb();
    buildOrphanedCrmPruneOps(db as never, USER_ID);

    for (const mock of [db.crmNote.deleteMany, db.crmTask.deleteMany]) {
      const arg = mock.mock.calls[0][0] as { where: Record<string, unknown> };
      expect(arg.where.targets).toEqual({ none: {} });
      expect(arg.where.userId).toBe(USER_ID);
    }
  });
});

describe("pruneOrphanedCrmRecords", () => {
  it("returns the number of pruned notes and tasks", async () => {
    const db = fakeDb();

    await expect(pruneOrphanedCrmRecords(db as never, USER_ID)).resolves.toEqual({
      notes: 2,
      tasks: 1,
    });
  });

  it("scopes the prune to the owning user", async () => {
    const db = fakeDb();
    await pruneOrphanedCrmRecords(db as never, "other-user");

    expect(db.crmNote.deleteMany).toHaveBeenCalledWith({
      where: { userId: "other-user", targets: { none: {} } },
    });
  });
});
