import {
  changeJobStatus,
  getKanbanBoard,
  updateKanbanOrder,
  getJobStatusHistory,
  getStatusDistribution,
  getValidTransitions,
} from "@/actions/job.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mock the Prisma Client
jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    jobStatus: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    job: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    jobStatusHistory: {
      findMany: jest.fn(),
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

jest.mock("@/lib/events", () => ({
  emitEvent: jest.fn(),
  createEvent: jest.fn((_type: string, payload: unknown) => ({
    type: _type,
    payload,
    timestamp: new Date(),
  })),
  DomainEventTypes: {
    JobStatusChanged: "JobStatusChanged",
  },
}));

describe("CRM Server Actions", () => {
  const mockUser = { id: "user-id" };

  const mockStatuses = [
    { id: "status-bookmarked", label: "Bookmarked", value: "bookmarked" },
    { id: "status-applied", label: "Applied", value: "applied" },
    { id: "status-interview", label: "Interview", value: "interview" },
    { id: "status-offer", label: "Offer", value: "offer" },
    { id: "status-accepted", label: "Accepted", value: "accepted" },
    { id: "status-rejected", label: "Rejected", value: "rejected" },
    { id: "status-archived", label: "Archived", value: "archived" },
  ];

  const mockJob = {
    id: "job-1",
    userId: "user-id",
    statusId: "status-bookmarked",
    Status: { id: "status-bookmarked", label: "Bookmarked", value: "bookmarked" },
    appliedDate: null,
    sortOrder: 0,
    JobTitle: { label: "Engineer" },
    Company: { label: "Acme", logoUrl: null },
    Location: { label: "Remote" },
    JobSource: null,
    tags: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  // ---------------------------------------------------------------------------
  // changeJobStatus
  // ---------------------------------------------------------------------------

  describe("changeJobStatus", () => {
    it("should reject if user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);
      const result = await changeJobStatus("job-1", "status-applied");
      expect(result.success).toBe(false);
      expect(result.message).toContain("errors.changeJobStatus");
    });

    it("should return NOT_FOUND if job does not exist", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await changeJobStatus("nonexistent", "status-applied");
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("NOT_FOUND");
    });

    it("should return NOT_FOUND if target status does not exist", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await changeJobStatus("job-1", "nonexistent-status-id");
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("NOT_FOUND");
    });

    it("should reject invalid transitions", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      // bookmarked → offer is NOT a valid transition
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(
        mockStatuses.find((s) => s.value === "offer"),
      );
      const result = await changeJobStatus("job-1", "status-offer");
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_TRANSITION");
    });

    it("should succeed for valid transition (bookmarked → applied)", async () => {
      const appliedStatus = mockStatuses.find((s) => s.value === "applied")!;
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(appliedStatus);

      const updatedJob = { ...mockJob, statusId: appliedStatus.id, Status: appliedStatus };
      const historyEntry = { id: "history-1" };

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            update: jest.fn().mockResolvedValue(updatedJob),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue(historyEntry),
          },
        });
      });

      const result = await changeJobStatus("job-1", appliedStatus.id, "Submitted application");
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("should set applied=true and appliedDate when transitioning to applied", async () => {
      const appliedStatus = mockStatuses.find((s) => s.value === "applied")!;
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(appliedStatus);

      let capturedUpdateData: any;
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            update: jest.fn().mockImplementation((args: any) => {
              capturedUpdateData = args.data;
              return { ...mockJob, statusId: appliedStatus.id, Status: appliedStatus };
            }),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: "history-1" }),
          },
        });
      });

      await changeJobStatus("job-1", appliedStatus.id);
      expect(capturedUpdateData.applied).toBe(true);
      expect(capturedUpdateData.appliedDate).toBeInstanceOf(Date);
    });

    it("should publish JobStatusChanged event after transition", async () => {
      const { emitEvent } = require("@/lib/events");
      const appliedStatus = mockStatuses.find((s) => s.value === "applied")!;
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(appliedStatus);

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            update: jest.fn().mockResolvedValue({
              ...mockJob,
              statusId: appliedStatus.id,
              Status: appliedStatus,
            }),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: "history-1" }),
          },
        });
      });

      await changeJobStatus("job-1", appliedStatus.id);
      expect(emitEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // DAU-2: changeJobStatus should verify expected fromStatus (optimistic lock)
  // ---------------------------------------------------------------------------

  describe("changeJobStatus — stale state detection (DAU-2)", () => {
    it("should reject when fromStatusId does not match the actual current status", async () => {
      // Scenario: User's UI shows the job as "bookmarked" but another tab/user
      // already moved it to "applied". The stale fromStatusId should be rejected.
      const jobCurrentlyApplied = {
        id: "job-1",
        userId: "user-id",
        statusId: "status-applied",
        Status: { id: "status-applied", label: "Applied", value: "applied" },
        appliedDate: new Date("2026-03-15"),
        sortOrder: 0,
        JobTitle: { label: "Engineer" },
        Company: { label: "Acme", logoUrl: null },
        Location: { label: "Remote" },
        JobSource: null,
        tags: [],
      };

      const interviewStatus = mockStatuses.find((s) => s.value === "interview")!;

      (prisma.job.findFirst as jest.Mock).mockResolvedValue(jobCurrentlyApplied);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(interviewStatus);

      // Call with a fromStatusId that does NOT match actual current status.
      // The caller thinks the job is "bookmarked" (stale), but it is actually "applied".
      const result = await changeJobStatus(
        "job-1",
        interviewStatus.id,
        undefined,
        "status-bookmarked", // expectedFromStatusId — STALE, actual is "status-applied"
      );

      // The function should detect the stale state and reject the transition
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("STALE_STATE");
    });

    it("should accept when fromStatusId matches the actual current status", async () => {
      const appliedStatus = mockStatuses.find((s) => s.value === "applied")!;
      const interviewStatus = mockStatuses.find((s) => s.value === "interview")!;

      const jobCurrentlyApplied = {
        ...mockJob,
        statusId: "status-applied",
        Status: appliedStatus,
      };

      (prisma.job.findFirst as jest.Mock).mockResolvedValue(jobCurrentlyApplied);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(interviewStatus);

      const updatedJob = {
        ...jobCurrentlyApplied,
        statusId: interviewStatus.id,
        Status: interviewStatus,
      };

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            update: jest.fn().mockResolvedValue(updatedJob),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: "history-1" }),
          },
        });
      });

      // Call with correct fromStatusId matching the actual current status
      const result = await changeJobStatus(
        "job-1",
        interviewStatus.id,
        undefined,
        "status-applied", // expectedFromStatusId — matches actual status
      );

      expect(result.success).toBe(true);
    });

    it("should NOT update the job when stale state is detected", async () => {
      const jobCurrentlyApplied = {
        ...mockJob,
        statusId: "status-applied",
        Status: { id: "status-applied", label: "Applied", value: "applied" },
      };

      const interviewStatus = mockStatuses.find((s) => s.value === "interview")!;

      (prisma.job.findFirst as jest.Mock).mockResolvedValue(jobCurrentlyApplied);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(interviewStatus);

      await changeJobStatus(
        "job-1",
        interviewStatus.id,
        undefined,
        "status-bookmarked", // STALE
      );

      // No transaction should have been started
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // getKanbanBoard
  // ---------------------------------------------------------------------------

  describe("getKanbanBoard", () => {
    it("should reject if user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);
      const result = await getKanbanBoard();
      expect(result.success).toBe(false);
    });

    it("should return columns in STATUS_ORDER", async () => {
      (prisma.jobStatus.findMany as jest.Mock).mockResolvedValue(mockStatuses);
      (prisma.job.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getKanbanBoard();
      expect(result.success).toBe(true);
      const columnValues = result.data!.columns.map((c) => c.statusValue);
      expect(columnValues).toEqual([
        "bookmarked",
        "applied",
        "interview",
        "offer",
        "accepted",
        "rejected",
        "archived",
      ]);
    });

    it("should group jobs by status", async () => {
      (prisma.jobStatus.findMany as jest.Mock).mockResolvedValue(mockStatuses);
      (prisma.job.findMany as jest.Mock).mockResolvedValue([
        {
          id: "job-1",
          JobTitle: { label: "Dev" },
          Company: { label: "Co", logoUrl: null },
          Location: { label: "Remote" },
          Status: { id: "status-bookmarked", value: "bookmarked", label: "Bookmarked" },
          matchScore: 85,
          dueDate: null,
          tags: [],
          sortOrder: 0,
          createdAt: new Date(),
          statusId: "status-bookmarked",
        },
        {
          id: "job-2",
          JobTitle: { label: "PM" },
          Company: { label: "Inc", logoUrl: null },
          Location: null,
          Status: { id: "status-applied", value: "applied", label: "Applied" },
          matchScore: null,
          dueDate: null,
          tags: [],
          sortOrder: 1,
          createdAt: new Date(),
          statusId: "status-applied",
        },
      ]);

      const result = await getKanbanBoard();
      expect(result.success).toBe(true);
      const bookmarkedCol = result.data!.columns.find((c) => c.statusValue === "bookmarked");
      const appliedCol = result.data!.columns.find((c) => c.statusValue === "applied");
      expect(bookmarkedCol!.jobCount).toBe(1);
      expect(appliedCol!.jobCount).toBe(1);
    });

    it("should mark rejected and archived as collapsed by default", async () => {
      (prisma.jobStatus.findMany as jest.Mock).mockResolvedValue(mockStatuses);
      (prisma.job.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getKanbanBoard();
      const rejectedCol = result.data!.columns.find((c) => c.statusValue === "rejected");
      const archivedCol = result.data!.columns.find((c) => c.statusValue === "archived");
      const bookmarkedCol = result.data!.columns.find((c) => c.statusValue === "bookmarked");

      expect(rejectedCol!.isCollapsed).toBe(true);
      expect(archivedCol!.isCollapsed).toBe(true);
      expect(bookmarkedCol!.isCollapsed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // updateKanbanOrder
  // ---------------------------------------------------------------------------

  describe("updateKanbanOrder", () => {
    it("should reject if user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);
      const result = await updateKanbanOrder("job-1", 1.5);
      expect(result.success).toBe(false);
    });

    it("should update sortOrder without status change (reorder within column)", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.job.update as jest.Mock).mockResolvedValue({
        ...mockJob,
        sortOrder: 1.5,
      });

      const result = await updateKanbanOrder("job-1", 1.5);
      expect(result.success).toBe(true);
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { sortOrder: 1.5 },
        }),
      );
    });

    it("should perform status transition when newStatusId differs", async () => {
      const appliedStatus = mockStatuses.find((s) => s.value === "applied")!;
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(appliedStatus);

      const updatedJob = {
        ...mockJob,
        statusId: appliedStatus.id,
        Status: appliedStatus,
        sortOrder: 2.0,
      };
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            update: jest.fn().mockResolvedValue(updatedJob),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: "history-2" }),
          },
        });
      });

      const result = await updateKanbanOrder("job-1", 2.0, appliedStatus.id);
      expect(result.success).toBe(true);
    });

    it("should reject invalid status transitions during drag", async () => {
      const offerStatus = mockStatuses.find((s) => s.value === "offer")!;
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(offerStatus);

      // bookmarked → offer is invalid
      const result = await updateKanbanOrder("job-1", 2.0, offerStatus.id);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("INVALID_TRANSITION");
    });
  });

  // ---------------------------------------------------------------------------
  // getJobStatusHistory
  // ---------------------------------------------------------------------------

  describe("getJobStatusHistory", () => {
    it("should reject if user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);
      const result = await getJobStatusHistory("job-1");
      expect(result.success).toBe(false);
    });

    it("should return NOT_FOUND if job does not belong to user", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await getJobStatusHistory("other-job");
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("NOT_FOUND");
    });

    it("should return formatted history entries", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue({ id: "job-1" });
      (prisma.jobStatusHistory.findMany as jest.Mock).mockResolvedValue([
        {
          id: "h-1",
          previousStatus: { label: "Bookmarked", value: "bookmarked" },
          newStatus: { label: "Applied", value: "applied" },
          note: "Submitted via email",
          changedAt: new Date("2026-04-01"),
        },
        {
          id: "h-2",
          previousStatus: null,
          newStatus: { label: "Bookmarked", value: "bookmarked" },
          note: null,
          changedAt: new Date("2026-03-15"),
        },
      ]);

      const result = await getJobStatusHistory("job-1");
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].previousStatusLabel).toBe("Bookmarked");
      expect(result.data![0].newStatusLabel).toBe("Applied");
      expect(result.data![0].note).toBe("Submitted via email");
      expect(result.data![1].previousStatusLabel).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getStatusDistribution
  // ---------------------------------------------------------------------------

  describe("getStatusDistribution", () => {
    it("should reject if user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);
      const result = await getStatusDistribution();
      expect(result.success).toBe(false);
    });

    it("should return counts grouped by status", async () => {
      (prisma.job.groupBy as jest.Mock).mockResolvedValue([
        { statusId: "status-bookmarked", _count: { id: 5 } },
        { statusId: "status-applied", _count: { id: 3 } },
      ]);
      (prisma.jobStatus.findMany as jest.Mock).mockResolvedValue(mockStatuses);

      const result = await getStatusDistribution();
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0]).toEqual({
        statusId: "status-bookmarked",
        statusValue: "bookmarked",
        statusLabel: "Bookmarked",
        count: 5,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getValidTransitions
  // ---------------------------------------------------------------------------

  describe("getValidTransitions", () => {
    it("should reject if user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);
      const result = await getValidTransitions("job-1");
      expect(result.success).toBe(false);
    });

    it("should return NOT_FOUND if job does not exist", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(null);
      const result = await getValidTransitions("nonexistent");
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("NOT_FOUND");
    });

    it("should return valid target statuses for bookmarked job", async () => {
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      const validStatuses = mockStatuses.filter((s) =>
        ["applied", "archived", "rejected"].includes(s.value),
      );
      (prisma.jobStatus.findMany as jest.Mock).mockResolvedValue(validStatuses);

      const result = await getValidTransitions("job-1");
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });
  });
});
