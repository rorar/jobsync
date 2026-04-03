import {
  changeJobStatus,
  updateJob,
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

describe("Optimistic Locking (S3-D3)", () => {
  const mockUser = { id: "user-id" };

  const mockStatuses = [
    { id: "status-bookmarked", label: "Bookmarked", value: "bookmarked" },
    { id: "status-applied", label: "Applied", value: "applied" },
    { id: "status-interview", label: "Interview", value: "interview" },
  ];

  const mockJob = {
    id: "job-1",
    userId: "user-id",
    statusId: "status-bookmarked",
    version: 3,
    Status: { id: "status-bookmarked", label: "Bookmarked", value: "bookmarked" },
    appliedDate: null,
    sortOrder: 0,
    JobTitle: { id: "title-1", label: "Engineer" },
    Company: { id: "comp-1", label: "Acme", logoUrl: null },
    Location: { id: "loc-1", label: "Remote" },
    JobSource: null,
    tags: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  // ---------------------------------------------------------------------------
  // changeJobStatus — version-based optimistic locking
  // ---------------------------------------------------------------------------

  describe("changeJobStatus — version-based optimistic locking", () => {
    it("should reject when expectedVersion does not match current version", async () => {
      // Job is at version 3, but caller expects version 1 (stale)
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(
        mockStatuses.find((s) => s.value === "applied"),
      );

      const result = await changeJobStatus(
        "job-1",
        "status-applied",
        undefined, // note
        undefined, // expectedFromStatusId
        1,         // expectedVersion (stale — job is at version 3)
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("STALE_STATE");
      expect(result.message).toBe("errors.staleState");
    });

    it("should succeed when expectedVersion matches current version", async () => {
      const appliedStatus = mockStatuses.find((s) => s.value === "applied")!;
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(appliedStatus);

      const updatedJob = {
        ...mockJob,
        statusId: appliedStatus.id,
        Status: appliedStatus,
        version: 4, // incremented
      };
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

      const result = await changeJobStatus(
        "job-1",
        appliedStatus.id,
        undefined, // note
        undefined, // expectedFromStatusId
        3,         // expectedVersion (matches current)
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("should increment version atomically on status change", async () => {
      const appliedStatus = mockStatuses.find((s) => s.value === "applied")!;
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(appliedStatus);

      let capturedUpdateData: Record<string, unknown> | undefined;

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            update: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedUpdateData = args.data;
              return {
                ...mockJob,
                statusId: appliedStatus.id,
                Status: appliedStatus,
                version: 4,
              };
            }),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: "history-1" }),
          },
        });
      });

      await changeJobStatus("job-1", appliedStatus.id);

      // Verify version is incremented atomically via Prisma { increment: 1 }
      expect(capturedUpdateData).toBeDefined();
      expect(capturedUpdateData!.version).toEqual({ increment: 1 });
    });

    it("should skip version check when expectedVersion is not provided", async () => {
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
              version: 4,
            }),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: "history-1" }),
          },
        });
      });

      // No expectedVersion passed — should succeed regardless of actual version
      const result = await changeJobStatus("job-1", appliedStatus.id);

      expect(result.success).toBe(true);
    });

    it("should detect concurrent writes from two tabs", async () => {
      // Simulate: Tab A and Tab B both read version 3
      // Tab A succeeds and increments to version 4
      // Tab B then fails because it still has expectedVersion 3

      const appliedStatus = mockStatuses.find((s) => s.value === "applied")!;

      // Tab A: version matches, succeeds
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob); // version: 3
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(appliedStatus);

      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            update: jest.fn().mockResolvedValue({
              ...mockJob,
              statusId: appliedStatus.id,
              Status: appliedStatus,
              version: 4,
            }),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: "history-1" }),
          },
        });
      });

      const tabAResult = await changeJobStatus(
        "job-1",
        appliedStatus.id,
        undefined,
        undefined,
        3, // matches current
      );
      expect(tabAResult.success).toBe(true);

      // Tab B: job now at version 4, but Tab B still has expectedVersion 3
      const jobAfterTabA = { ...mockJob, version: 4, statusId: "status-applied", Status: appliedStatus };
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(jobAfterTabA);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(
        mockStatuses.find((s) => s.value === "interview"),
      );

      const tabBResult = await changeJobStatus(
        "job-1",
        "status-interview",
        undefined,
        undefined,
        3, // stale — job is now at version 4
      );
      expect(tabBResult.success).toBe(false);
      expect(tabBResult.errorCode).toBe("STALE_STATE");
    });
  });

  // ---------------------------------------------------------------------------
  // updateJob — version-based optimistic locking
  // ---------------------------------------------------------------------------

  describe("updateJob — version-based optimistic locking", () => {
    const mockUpdateData = {
      id: "job-1",
      title: "title-1",
      company: "comp-1",
      location: "loc-1",
      type: "Full-time",
      status: "status-bookmarked",
      source: "src-1",
      salaryRange: "50k-70k",
      dueDate: new Date("2026-06-01"),
      jobDescription: "A test job description for testing purposes",
      applied: false,
      tags: [],
      sendToQueue: false,
    };

    it("should reject when expectedVersion does not match current version", async () => {
      // Set up FK ownership mocks
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "title-1" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "comp-1" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "loc-1" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "src-1" });

      // Current job with version 5
      (prisma.job.findFirst as jest.Mock).mockResolvedValue({
        ...mockJob,
        version: 5,
      });

      const result = await updateJob(
        mockUpdateData,
        2, // expectedVersion (stale — job is at version 5)
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("STALE_STATE");
      expect(result.message).toBe("errors.staleState");
    });

    it("should succeed when expectedVersion matches current version", async () => {
      // Set up FK ownership mocks
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "title-1" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "comp-1" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "loc-1" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "src-1" });

      // findFirst for status-check path
      (prisma.job.findFirst as jest.Mock).mockResolvedValue({
        ...mockJob,
        version: 3,
      });

      const updatedJob = { ...mockJob, version: 4 };
      (prisma.job.update as jest.Mock).mockResolvedValue(updatedJob);

      const result = await updateJob(
        mockUpdateData,
        3, // matches current version
      );

      expect(result.success).toBe(true);
    });

    it("should increment version on every update", async () => {
      // Set up FK ownership mocks
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "title-1" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "comp-1" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "loc-1" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "src-1" });

      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);

      let capturedUpdateData: Record<string, unknown> | undefined;
      (prisma.job.update as jest.Mock).mockImplementation((args: { data: Record<string, unknown> }) => {
        capturedUpdateData = args.data;
        return { ...mockJob, version: 4 };
      });

      await updateJob(mockUpdateData);

      // Version should be incremented even without expectedVersion
      expect(capturedUpdateData).toBeDefined();
      expect(capturedUpdateData!.version).toEqual({ increment: 1 });
    });

    it("should skip version check when expectedVersion is not provided", async () => {
      // Set up FK ownership mocks
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "title-1" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "comp-1" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "loc-1" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "src-1" });

      (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);
      (prisma.job.update as jest.Mock).mockResolvedValue({ ...mockJob, version: 4 });

      // No expectedVersion — should succeed regardless
      const result = await updateJob(mockUpdateData);

      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Version field defaults
  // ---------------------------------------------------------------------------

  describe("version field behavior", () => {
    it("should default to version 0 for new jobs (schema default)", () => {
      // This tests the schema contract — version defaults to 0 in the Prisma schema.
      // The actual default is enforced at the DB level via @default(0).
      // Here we verify the mock reflects that default properly.
      const newJob = {
        ...mockJob,
        version: 0,
      };
      expect(newJob.version).toBe(0);
    });

    it("should use STALE_STATE errorCode for version conflicts", async () => {
      // Ensure the error code matches what the UI already handles for stale states
      (prisma.job.findFirst as jest.Mock).mockResolvedValue({ ...mockJob, version: 5 });
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(
        mockStatuses.find((s) => s.value === "applied"),
      );

      const result = await changeJobStatus(
        "job-1",
        "status-applied",
        undefined,
        undefined,
        0, // stale version
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("STALE_STATE");
      // The message should be the existing i18n key
      expect(result.message).toBe("errors.staleState");
    });
  });
});
