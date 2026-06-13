/**
 * Job-Status Repository tests (Welle 4, F-AJ-09).
 * Covers create (slug + ownership), rename, reorder, setDefault, and the
 * delete-in-use / reassignment guards. Spec: specs/job-status.allium.
 */

import {
  createJobStatus,
  renameJobStatus,
  reorderJobStatus,
  setDefaultJobStatus,
  deleteJobStatus,
} from "@/actions/jobStatus.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

jest.mock("@prisma/client", () => {
  const m = {
    jobStatus: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    jobStatusCategory: { findFirst: jest.fn(), findMany: jest.fn() },
    job: { count: jest.fn(), updateMany: jest.fn() },
    jobStatusHistory: { count: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => m) };
});

jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db", () => {
  const { PrismaClient } = jest.requireMock("@prisma/client");
  return new PrismaClient();
});
// seed helper is exercised separately; stub it so getJobStatuses empty-path is inert
jest.mock("@/lib/crm/seed-job-statuses", () => ({
  seedJobStatusesForUser: jest.fn(),
  getDefaultJobStatusForUser: jest.fn(),
}));

const prisma = new PrismaClient() as unknown as {
  jobStatus: Record<string, jest.Mock>;
  jobStatusCategory: Record<string, jest.Mock>;
  job: Record<string, jest.Mock>;
  jobStatusHistory: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

const mockUser = { id: "user-1", name: "T", email: "t@example.com" };

beforeEach(() => {
  jest.clearAllMocks();
  // $transaction: support both array form and callback form.
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]),
  );
});

describe("createJobStatus", () => {
  it("rejects unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const r = await createJobStatus("cat-1", "Phone Screen");
    expect(r.success).toBe(false);
    expect(r.message).toBe("errors.notAuthenticated");
  });

  it("rejects empty label", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    const r = await createJobStatus("cat-1", "   ");
    expect(r.success).toBe(false);
    expect(r.message).toBe("errors.statusLabelRequired");
  });

  it("rejects a category the user does not own (IDOR)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatusCategory.findFirst.mockResolvedValue(null);
    const r = await createJobStatus("cat-other", "Phone Screen");
    expect(r.success).toBe(false);
    expect(prisma.jobStatusCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cat-other", userId: "user-1" } }),
    );
  });

  it("slugifies the label and avoids collisions", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatusCategory.findFirst.mockResolvedValue({ id: "cat-1" });
    prisma.jobStatus.findMany.mockResolvedValue([{ value: "phone-screen" }]);
    prisma.jobStatus.create.mockResolvedValue({ id: "s-new" });

    const r = await createJobStatus("cat-1", "Phone Screen!");
    expect(r.success).toBe(true);
    expect(prisma.jobStatus.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", categoryId: "cat-1", value: "phone-screen-2", isDefault: false }),
      }),
    );
  });
});

describe("reorderJobStatus", () => {
  it("rejects a non-integer sort order (ADR-019 boundary)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    const r = await reorderJobStatus("s-1", 2.5);
    expect(r.success).toBe(false);
    expect(r.message).toBe("errors.invalidSortOrder");
  });

  it("ACCEPTS a negative sort order — moving a status above the top item at 0", async () => {
    // Regression (review HIGH): the midpoint reorder helper returns negative
    // values to move a status to the top of its stage; the server must not
    // reject them, or "move up" on a freshly-seeded top item always errors.
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.updateMany.mockResolvedValue({ count: 1 });
    const r = await reorderJobStatus("s-1", -1000);
    expect(r.success).toBe(true);
    expect(prisma.jobStatus.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s-1", userId: "user-1" }, data: { sortOrder: -1000 } }),
    );
  });

  it("scopes the update by userId and 404s when nothing matched", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.updateMany.mockResolvedValue({ count: 0 });
    const r = await reorderJobStatus("s-x", 2);
    expect(prisma.jobStatus.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s-x", userId: "user-1" } }),
    );
    expect(r.success).toBe(false);
  });
});

describe("setDefaultJobStatus", () => {
  it("clears the previous default then sets the new one", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.findFirst.mockResolvedValue({ id: "s-2" });
    prisma.jobStatus.updateMany.mockResolvedValue({ count: 1 });
    prisma.jobStatus.update.mockResolvedValue({ id: "s-2" });

    const r = await setDefaultJobStatus("s-2");
    expect(r.success).toBe(true);
    expect(prisma.jobStatus.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", isDefault: true }, data: { isDefault: false } }),
    );
    expect(prisma.jobStatus.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s-2" }, data: { isDefault: true } }),
    );
  });
});

describe("renameJobStatus", () => {
  it("recomputes applied when moving a status into an applied stage", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.findFirst.mockResolvedValue({ id: "s-1" });
    prisma.jobStatusCategory.findFirst.mockResolvedValue({ id: "cat-applied", isAppliedStage: true });
    prisma.jobStatus.update.mockResolvedValue({ id: "s-1" });
    prisma.job.updateMany.mockResolvedValue({ count: 2 });

    const r = await renameJobStatus("s-1", "Phone Screen", "cat-applied");
    expect(r.success).toBe(true);
    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", statusId: "s-1", applied: false }, data: { applied: true } }),
    );
  });

  it("does NOT touch applied when moving into a non-applied stage", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.findFirst.mockResolvedValue({ id: "s-1" });
    prisma.jobStatusCategory.findFirst.mockResolvedValue({ id: "cat-lead", isAppliedStage: false });
    prisma.jobStatus.update.mockResolvedValue({ id: "s-1" });

    const r = await renameJobStatus("s-1", "Saved", "cat-lead");
    expect(r.success).toBe(true);
    expect(prisma.job.updateMany).not.toHaveBeenCalled();
  });
});

describe("deleteJobStatus", () => {
  it("refuses to delete the default status", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.findFirst.mockResolvedValue({ id: "s-1", isDefault: true });
    const r = await deleteJobStatus("s-1");
    expect(r.success).toBe(false);
    expect(r.message).toBe("errors.cannotDeleteDefaultStatus");
  });

  it("refuses to delete the last remaining status", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.findFirst.mockResolvedValue({ id: "s-1", isDefault: false });
    prisma.jobStatus.count.mockResolvedValue(1);
    const r = await deleteJobStatus("s-1");
    expect(r.success).toBe(false);
    expect(r.message).toBe("errors.cannotDeleteLastStatus");
  });

  it("blocks delete-in-use without a reassignment target (STATUS_IN_USE)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.findFirst.mockResolvedValue({ id: "s-1", isDefault: false });
    prisma.jobStatus.count.mockResolvedValue(5);
    prisma.job.count.mockResolvedValue(3);
    prisma.jobStatusHistory.count.mockResolvedValue(0);
    const r = await deleteJobStatus("s-1");
    expect(r.success).toBe(false);
    expect(r.message).toBe("errors.statusInUse");
    expect(r.errorCode).toBe("REFERENCE_ERROR");
  });

  it("blocks delete when only history references it (FK RESTRICT reality)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.findFirst.mockResolvedValue({ id: "s-1", isDefault: false });
    prisma.jobStatus.count.mockResolvedValue(5);
    prisma.job.count.mockResolvedValue(0);
    prisma.jobStatusHistory.count.mockResolvedValue(2);
    const r = await deleteJobStatus("s-1");
    expect(r.success).toBe(false);
    expect(r.message).toBe("errors.statusInUse");
  });

  it("repoints jobs + history then deletes when a target is supplied", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.findFirst
      .mockResolvedValueOnce({ id: "s-1", isDefault: false }) // the status
      .mockResolvedValueOnce({ id: "s-2" }); // the reassign target
    prisma.jobStatus.count.mockResolvedValue(5);
    prisma.job.count.mockResolvedValue(3);
    prisma.jobStatusHistory.count.mockResolvedValue(1);
    prisma.job.updateMany.mockResolvedValue({ count: 3 });
    prisma.jobStatusHistory.updateMany.mockResolvedValue({ count: 1 });
    prisma.jobStatus.delete.mockResolvedValue({ id: "s-1" });

    const r = await deleteJobStatus("s-1", "s-2");
    expect(r.success).toBe(true);
    expect(prisma.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", statusId: "s-1" }, data: { statusId: "s-2" } }),
    );
    expect(prisma.jobStatus.delete).toHaveBeenCalledWith({ where: { id: "s-1" } });
  });

  it("does a plain delete when nothing references it", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    prisma.jobStatus.findFirst.mockResolvedValue({ id: "s-1", isDefault: false });
    prisma.jobStatus.count.mockResolvedValue(5);
    prisma.job.count.mockResolvedValue(0);
    prisma.jobStatusHistory.count.mockResolvedValue(0);
    prisma.jobStatus.delete.mockResolvedValue({ id: "s-1" });

    const r = await deleteJobStatus("s-1");
    expect(r.success).toBe(true);
    expect(prisma.jobStatus.delete).toHaveBeenCalledWith({ where: { id: "s-1" } });
  });
});
