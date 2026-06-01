/**
 * Welle 1 Phase 4 (S6a) — Job-CRUD GDPR audit trail.
 *
 * Verifies that every Job mutation in job.actions.ts + note.actions.ts writes
 * exactly one data-audit entry with the correct action / targetType / targetId,
 * and that only update / status-change carry a before/after snapshot (create /
 * delete / note-add do not).
 *
 * Spec: specs/audit-trail.allium (rules AuditJobCreate / AuditJobUpdate /
 * AuditJobDelete / AuditJobStatusChange / AuditJobNoteAdd + invariant
 * SnapshotsAreFieldDiffsNotPii).
 */
import {
  addJob,
  updateJob,
  deleteJobById,
  changeJobStatus,
  updateKanbanOrder,
} from "@/actions/job.actions";
import { addNote } from "@/actions/note.actions";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

jest.mock("server-only", () => ({}));

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    jobStatus: {
      findFirst: jest.fn(),
    },
    jobTitle: {
      findFirst: jest.fn(),
    },
    company: {
      findFirst: jest.fn(),
    },
    location: {
      findFirst: jest.fn(),
    },
    jobSource: {
      findFirst: jest.fn(),
    },
    resume: {
      findFirst: jest.fn(),
    },
    tag: {
      count: jest.fn(),
    },
    job: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    note: {
      create: jest.fn(),
    },
    jobStatusHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/audit/data-audit", () => ({
  writeDataAuditLog: jest.fn(),
}));

jest.mock("@/lib/events", () => ({
  emitEvent: jest.fn(),
  createEvent: jest.fn((_type: string, payload: unknown) => ({
    type: _type,
    payload,
    timestamp: new Date(),
  })),
  DomainEventTypes: { JobStatusChanged: "JobStatusChanged" },
}));

jest.mock("@/lib/crm/status-machine", () => ({
  isValidTransition: jest.fn().mockReturnValue(true),
  computeTransitionSideEffects: jest.fn().mockReturnValue({}),
  getValidTargets: jest.fn().mockReturnValue([]),
  STATUS_ORDER: ["bookmarked", "applied", "interview", "offer", "rejected"],
  COLLAPSED_BY_DEFAULT: [],
}));

jest.mock("@/lib/crm/validate-edit-transition", () => ({
  isEditTransitionValid: jest.fn().mockReturnValue(true),
}));

const auditMock = writeDataAuditLog as jest.Mock;

describe("Job-CRUD audit trail (S6a)", () => {
  const mockUser = { id: "user-id", email: "user@example.com" };

  const jobData = {
    id: "job-id",
    title: "job-title-id",
    company: "company-id",
    location: "location-id",
    type: "FT",
    status: "status-id",
    source: "source-id",
    salaryRange: "$50,000 - $70,000",
    dueDate: new Date("2023-01-01"),
    dateApplied: new Date("2022-12-31"),
    jobDescription: "Job description",
    jobUrl: "https://example.com/job",
    applied: true,
    resume: "",
    tags: [],
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
    (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
    (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });
  });

  describe("addJob → job.create", () => {
    it("writes one audit entry with action job.create, no snapshot", async () => {
      const createdJob = {
        id: "new-job-id",
        Status: { id: "status-id", label: "Bookmarked", value: "bookmarked" },
      };
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue({ id: "status-id" });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) =>
        fn({
          job: { create: jest.fn().mockResolvedValue(createdJob) },
          jobStatusHistory: { create: jest.fn().mockResolvedValue({ id: "history-1" }) },
        }),
      );

      const result = await addJob(jobData);

      expect(result.success).toBe(true);
      expect(auditMock).toHaveBeenCalledTimes(1);
      const call = auditMock.mock.calls[0][0];
      expect(call).toMatchObject({
        actorId: mockUser.id,
        actorEmail: mockUser.email,
        action: "job.create",
        targetType: "job",
        targetId: "new-job-id",
      });
      expect(call.beforeAfter).toBeUndefined();
    });

    it("does not write an audit entry when creation fails", async () => {
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue({ id: "status-id" });
      (prisma.$transaction as jest.Mock).mockRejectedValue(new Error("boom"));

      const result = await addJob(jobData);

      expect(result.success).toBe(false);
      expect(auditMock).not.toHaveBeenCalled();
    });
  });

  describe("updateJob → job.update", () => {
    it("writes one audit entry with action job.update and a before/after snapshot of changed scalar fields", async () => {
      // currentJob differs from jobData in salaryRange + jobUrl → those should
      // appear in the diff; the unchanged status (same statusId) must not trigger
      // the status-change path.
      const currentJob = {
        id: "job-id",
        statusId: "status-id",
        jobTitleId: "job-title-id",
        companyId: "company-id",
        locationId: "location-id",
        jobSourceId: "source-id",
        salaryRange: "OLD SALARY",
        dueDate: new Date("2023-01-01"),
        appliedDate: new Date("2022-12-31"),
        description: "Job description",
        jobType: "FT",
        jobUrl: "https://old.example.com/job",
        applied: true,
        resumeId: null,
        version: 1,
        Status: { id: "status-id", label: "Bookmarked", value: "bookmarked" },
      };
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(currentJob);
      (prisma.job.update as jest.Mock).mockResolvedValue({ ...currentJob });

      const result = await updateJob(jobData);

      expect(result.success).toBe(true);
      expect(auditMock).toHaveBeenCalledTimes(1);
      const call = auditMock.mock.calls[0][0];
      expect(call).toMatchObject({
        actorId: mockUser.id,
        actorEmail: mockUser.email,
        action: "job.update",
        targetType: "job",
        targetId: "job-id",
      });
      // Snapshot present and contains only the changed scalar fields.
      expect(call.beforeAfter).toBeDefined();
      expect(call.beforeAfter).toEqual({
        salaryRange: { before: "OLD SALARY", after: "$50,000 - $70,000" },
        jobUrl: {
          before: "https://old.example.com/job",
          after: "https://example.com/job",
        },
      });
    });

    it("does not write an audit entry when the update fails", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue({
        id: "job-id",
        statusId: "status-id",
        version: 1,
        Status: { id: "status-id", value: "bookmarked" },
      });
      (prisma.job.update as jest.Mock).mockRejectedValue(new Error("boom"));

      const result = await updateJob(jobData);

      expect(result.success).toBe(false);
      expect(auditMock).not.toHaveBeenCalled();
    });
  });

  describe("deleteJobById → job.delete", () => {
    it("writes one audit entry with action job.delete, no snapshot", async () => {
      (prisma.job.delete as jest.Mock).mockResolvedValue({ id: "job-id" });

      const result = await deleteJobById("job-id");

      expect(result.success).toBe(true);
      expect(auditMock).toHaveBeenCalledTimes(1);
      const call = auditMock.mock.calls[0][0];
      expect(call).toMatchObject({
        actorId: mockUser.id,
        actorEmail: mockUser.email,
        action: "job.delete",
        targetType: "job",
        targetId: "job-id",
      });
      expect(call.beforeAfter).toBeUndefined();
    });

    it("does not write an audit entry when the delete fails", async () => {
      (prisma.job.delete as jest.Mock).mockRejectedValue(new Error("boom"));

      const result = await deleteJobById("job-id");

      expect(result.success).toBe(false);
      expect(auditMock).not.toHaveBeenCalled();
    });
  });

  describe("changeJobStatus → job.status_change", () => {
    it("writes one audit entry with action job.status_change and a status before/after snapshot", async () => {
      const currentJob = {
        id: "job-id",
        statusId: "status-bookmarked",
        appliedDate: null,
        version: 1,
        Status: { id: "status-bookmarked", label: "Bookmarked", value: "bookmarked" },
      };
      const newStatus = { id: "status-applied", label: "Applied", value: "applied" };
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(currentJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(newStatus);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) =>
        fn({
          job: {
            update: jest.fn().mockResolvedValue({
              ...currentJob,
              statusId: newStatus.id,
              Status: newStatus,
            }),
          },
          jobStatusHistory: { create: jest.fn().mockResolvedValue({ id: "history-1" }) },
        }),
      );

      const result = await changeJobStatus("job-id", "status-applied");

      expect(result.success).toBe(true);
      expect(auditMock).toHaveBeenCalledTimes(1);
      const call = auditMock.mock.calls[0][0];
      expect(call).toMatchObject({
        actorId: mockUser.id,
        actorEmail: mockUser.email,
        action: "job.status_change",
        targetType: "job",
        targetId: "job-id",
      });
      expect(call.beforeAfter).toEqual({
        status: { before: "bookmarked", after: "applied" },
      });
    });

    it("does not write an audit entry when the transition is invalid", async () => {
      const {
        isValidTransition,
      } = require("@/lib/crm/status-machine");
      (isValidTransition as jest.Mock).mockReturnValueOnce(false);
      (prisma.job.findFirst as jest.Mock).mockResolvedValue({
        id: "job-id",
        statusId: "status-bookmarked",
        appliedDate: null,
        version: 1,
        Status: { id: "status-bookmarked", value: "bookmarked" },
      });
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue({
        id: "status-offer",
        value: "offer",
      });

      const result = await changeJobStatus("job-id", "status-offer");

      expect(result.success).toBe(false);
      expect(auditMock).not.toHaveBeenCalled();
    });
  });

  describe("addNote → job.note_add", () => {
    it("writes one audit entry with action job.note_add against the Job, no snapshot", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue({ id: "job-id" });
      (prisma.note.create as jest.Mock).mockResolvedValue({
        id: "note-id",
        jobId: "job-id",
        content: "Some note",
      });

      const result = await addNote({ jobId: "job-id", content: "Some note" } as never);

      expect(result.success).toBe(true);
      expect(auditMock).toHaveBeenCalledTimes(1);
      const call = auditMock.mock.calls[0][0];
      expect(call).toMatchObject({
        actorId: mockUser.id,
        actorEmail: mockUser.email,
        action: "job.note_add",
        targetType: "job",
        targetId: "job-id",
      });
      expect(call.beforeAfter).toBeUndefined();
    });

    it("does not write an audit entry when the note's Job is not owned", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await addNote({ jobId: "job-id", content: "Some note" } as never);

      expect(result.success).toBe(false);
      expect(auditMock).not.toHaveBeenCalled();
    });
  });

  describe("updateKanbanOrder (drag-drop) → job.status_change", () => {
    const bookmarked = { id: "status-bookmarked", label: "Bookmarked", value: "bookmarked" };
    const applied = { id: "status-applied", label: "Applied", value: "applied" };

    it("writes one job.status_change audit entry with a status snapshot on a cross-column move", async () => {
      const currentJob = {
        id: "job-id",
        userId: mockUser.id,
        statusId: bookmarked.id,
        Status: bookmarked,
        appliedDate: null,
        version: 1,
      };
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(currentJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(applied);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) =>
        fn({
          job: {
            update: jest.fn().mockResolvedValue({
              ...currentJob,
              statusId: applied.id,
              Status: applied,
            }),
          },
          jobStatusHistory: { create: jest.fn().mockResolvedValue({ id: "history-1" }) },
        }),
      );

      const result = await updateKanbanOrder("job-id", 1000, applied.id);

      expect(result.success).toBe(true);
      expect(auditMock).toHaveBeenCalledTimes(1);
      const call = auditMock.mock.calls[0][0];
      expect(call).toMatchObject({
        actorId: mockUser.id,
        actorEmail: mockUser.email,
        action: "job.status_change",
        targetType: "job",
        targetId: "job-id",
      });
      expect(call.beforeAfter).toEqual({
        status: { before: "bookmarked", after: "applied" },
      });
    });

    it("does not write an audit entry for a same-column reorder (no status change)", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue({
        id: "job-id",
        userId: mockUser.id,
        statusId: bookmarked.id,
        Status: bookmarked,
        appliedDate: null,
        version: 1,
      });
      (prisma.job.update as jest.Mock).mockResolvedValue({
        id: "job-id",
        Status: bookmarked,
      });

      // No newStatusId → same-column reorder branch.
      const result = await updateKanbanOrder("job-id", 2000);

      expect(result.success).toBe(true);
      expect(auditMock).not.toHaveBeenCalled();
    });
  });
});
