/**
 * Unit tests for the GDPR data audit-trail writer (Welle 1 S6a/S6b).
 * Spec: specs/audit-trail.allium. Verifies the sink structurally enforces the
 * PII-minimisation invariants and never throws to the caller.
 */
jest.mock("server-only", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: "audit-1" }),
    },
  },
}));

import prisma from "@/lib/db";
import { writeDataAuditLog } from "@/lib/audit/data-audit";

const createMock = prisma.adminAuditLog.create as jest.Mock;

describe("writeDataAuditLog", () => {
  beforeEach(() => jest.clearAllMocks());

  it("persists a Job create row with target_type=job and no snapshot", () => {
    writeDataAuditLog({
      actorId: "u1",
      actorEmail: "u1@example.com",
      action: "job.create",
      targetType: "job",
      targetId: "job-1",
    });
    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: "job.create",
      targetType: "job",
      targetId: "job-1",
      actorId: "u1",
      actorEmail: "u1@example.com",
      allowed: true,
      extra: null,
    });
  });

  it("persists a before/after snapshot for job.update", () => {
    writeDataAuditLog({
      actorId: "u1",
      action: "job.update",
      targetType: "job",
      targetId: "job-1",
      beforeAfter: { title: { before: "A", after: "B" } },
    });
    const data = createMock.mock.calls[0][0].data;
    expect(data.extra).toBe(JSON.stringify({ title: { before: "A", after: "B" } }));
  });

  it("persists a snapshot for job.status_change", () => {
    writeDataAuditLog({
      actorId: "u1",
      action: "job.status_change",
      targetType: "job",
      targetId: "job-1",
      beforeAfter: { status: { before: "applied", after: "interview" } },
    });
    expect(createMock.mock.calls[0][0].data.extra).toContain("interview");
  });

  it("DROPS any snapshot for person.pii_read (DataMinimisation invariant)", () => {
    writeDataAuditLog({
      actorId: "u1",
      action: "person.pii_read",
      targetType: "person",
      targetId: "p-1",
      // A caller mistake: passing PII content. The sink MUST drop it.
      beforeAfter: { name: "Jane Doe", email: "jane@example.com" } as Record<string, unknown>,
    });
    const data = createMock.mock.calls[0][0].data;
    expect(data.action).toBe("person.pii_read");
    expect(data.targetType).toBe("person");
    expect(data.extra).toBeNull();
  });

  it("DROPS snapshots for job.create / job.delete / job.note_add", () => {
    for (const action of ["job.create", "job.delete", "job.note_add"] as const) {
      createMock.mockClear();
      writeDataAuditLog({
        actorId: "u1",
        action,
        targetType: "job",
        targetId: "job-1",
        beforeAfter: { x: 1 },
      });
      expect(createMock.mock.calls[0][0].data.extra).toBeNull();
    }
  });

  it("never throws when the DB write rejects (fail-open)", async () => {
    createMock.mockRejectedValueOnce(new Error("db down"));
    expect(() =>
      writeDataAuditLog({ actorId: "u1", action: "job.delete", targetType: "job", targetId: "j1" }),
    ).not.toThrow();
  });

  it("never throws when prisma create throws synchronously", () => {
    createMock.mockImplementationOnce(() => {
      throw new Error("schema drift");
    });
    expect(() =>
      writeDataAuditLog({ actorId: "u1", action: "job.create", targetType: "job", targetId: "j1" }),
    ).not.toThrow();
  });
});
