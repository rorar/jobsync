import {
  addJob,
  createLocation,
  deleteJobById,
  getJobDetails,
  getJobsList,
  getJobSourceList,
  getStatusList,
  updateJob,
  updateJobStatus,
} from "@/actions/job.actions";
import { getMockJobDetails, getMockJobsList } from "@/lib/mock.utils";
import { JobResponse } from "@/models/job.model";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Mock the Prisma Client
jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    jobStatus: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    jobSource: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    jobTitle: {
      findFirst: jest.fn(),
    },
    company: {
      findFirst: jest.fn(),
    },
    resume: {
      findFirst: jest.fn(),
    },
    tag: {
      count: jest.fn(),
    },
    job: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    jobStatusHistory: {
      create: jest.fn(),
    },
    location: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
  DomainEventTypes: { JobStatusChanged: "JobStatusChanged" },
}));

jest.mock("@/lib/crm/status-machine", () => ({
  isValidTransition: jest.fn().mockReturnValue(true),
  computeTransitionSideEffects: jest.fn().mockReturnValue({}),
  getValidTargets: jest.fn().mockReturnValue([]),
  STATUS_ORDER: ["bookmarked", "applied", "interview", "offer", "rejected", "ghosted", "withdrawn"],
  COLLAPSED_BY_DEFAULT: [],
}));

describe("jobActions", () => {
  const mockUser = { id: "user-id" };
  const jobData = {
    id: "job-id",
    title: "job-title-id",
    company: "company-id",
    location: "location-id",
    type: "FT",
    status: "status-id",
    source: "source-id",
    salaryRange: "$50,000 - $70,000",
    createdAt: expect.any(Date),
    dueDate: new Date("2023-01-01"),
    dateApplied: new Date("2022-12-31"),
    jobDescription: "Job description",
    jobUrl: "https://example.com/job",
    applied: true,
    userId: mockUser.id,
    resume: "",
    tags: [],
    sendToQueue: false,
  };
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe("getStatusList", () => {
    it("should return status list on successful query", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const mockStatuses = [
        { id: "1", label: "Pending", value: "pending" },
        { id: "2", label: "Processing", value: "processing" },
      ];
      (prisma.jobStatus.findMany as jest.Mock).mockResolvedValue(mockStatuses);

      const result = await getStatusList();
      expect(result).toEqual({ success: true, data: mockStatuses });
    });

    it("should throw error on failure", async () => {
      const mockErrorResponse = {
        success: false,
        message: "errors.fetchStatusList",
      };
      (prisma.jobStatus.findMany as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      await expect(getStatusList()).resolves.toStrictEqual(mockErrorResponse);
    });
  });
  describe("getJobSourceList", () => {
    it("should return job source list on successful query", async () => {
      const mockData = [
        { id: "1", label: "Source 1", value: "source1" },
        { id: "2", label: "Source 2", value: "source2" },
      ];
      (prisma.jobSource.findMany as jest.Mock).mockResolvedValue(mockData);

      const result = await getJobSourceList();

      expect(result).toEqual({ success: true, data: mockData });
      expect(prisma.jobSource.findMany).toHaveBeenCalledTimes(1);
    });

    it("should returns failure response on error", async () => {
      (prisma.jobSource.findMany as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      const result = await getJobSourceList();

      expect(result).toEqual({
        success: false,
        message: "errors.fetchJobSourceList",
      });

      expect(prisma.jobSource.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("getJobsList", () => {
    it("should retrieve jobs with default parameters", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const { data, total } = await getMockJobsList(1, 10);
      (prisma.job.findMany as jest.Mock).mockResolvedValue(data);
      (prisma.job.count as jest.Mock).mockResolvedValue(total);

      const result = await getJobsList();

      expect(result).toEqual({
        success: true,
        data,
        total,
      });
      expect(prisma.job.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.job.count).toHaveBeenCalledTimes(1);
    });
    it("should return error when fetching data fails", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      (prisma.job.findMany as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );

      const result = await getJobsList();

      expect(result).toEqual({
        success: false,
        message: "Failed to fetch jobs list. ",
      });
    });
    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getJobsList();

      expect(result).toEqual({
        success: false,
        message: "Failed to fetch jobs list. ",
      });
    });

    describe("search functionality", () => {
      it("should build OR clause when search parameter is provided", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        const { data, total } = await getMockJobsList(1, 10);
        (prisma.job.findMany as jest.Mock).mockResolvedValue(data);
        (prisma.job.count as jest.Mock).mockResolvedValue(total);

        await getJobsList(1, 10, undefined, "Amazon");

        expect(prisma.job.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              userId: mockUser.id,
              OR: [
                { JobTitle: { label: { contains: "Amazon" } } },
                { Company: { label: { contains: "Amazon" } } },
                { Location: { label: { contains: "Amazon" } } },
                { description: { contains: "Amazon" } },
              ],
            }),
          }),
        );
        expect(prisma.job.count).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: [
                { JobTitle: { label: { contains: "Amazon" } } },
                { Company: { label: { contains: "Amazon" } } },
                { Location: { label: { contains: "Amazon" } } },
                { description: { contains: "Amazon" } },
              ],
            }),
          }),
        );
      });

      it("should search across job title", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.job.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.job.count as jest.Mock).mockResolvedValue(0);

        await getJobsList(1, 10, undefined, "Developer");

        const findManyCall = (prisma.job.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toContainEqual({
          JobTitle: { label: { contains: "Developer" } },
        });
      });

      it("should search across company name", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.job.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.job.count as jest.Mock).mockResolvedValue(0);

        await getJobsList(1, 10, undefined, "Google");

        const findManyCall = (prisma.job.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toContainEqual({
          Company: { label: { contains: "Google" } },
        });
      });

      it("should search across location", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.job.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.job.count as jest.Mock).mockResolvedValue(0);

        await getJobsList(1, 10, undefined, "Remote");

        const findManyCall = (prisma.job.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toContainEqual({
          Location: { label: { contains: "Remote" } },
        });
      });

      it("should search across description", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.job.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.job.count as jest.Mock).mockResolvedValue(0);

        await getJobsList(1, 10, undefined, "React");

        const findManyCall = (prisma.job.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toContainEqual({
          description: { contains: "React" },
        });
      });

      it("should combine search with filter", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.job.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.job.count as jest.Mock).mockResolvedValue(0);

        await getJobsList(1, 10, "applied", "Developer");

        const findManyCall = (prisma.job.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where).toMatchObject({
          userId: mockUser.id,
          Status: { value: "applied" },
          OR: expect.any(Array),
        });
      });

      it("should not include OR clause when search is undefined", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.job.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.job.count as jest.Mock).mockResolvedValue(0);

        await getJobsList(1, 10, undefined, undefined);

        const findManyCall = (prisma.job.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toBeUndefined();
      });

      it("should not include OR clause when search is empty string", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.job.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.job.count as jest.Mock).mockResolvedValue(0);

        await getJobsList(1, 10, undefined, "");

        const findManyCall = (prisma.job.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where.OR).toBeUndefined();
      });

      it("should return filtered results with correct pagination", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        const mockFilteredData = [
          {
            id: "1",
            JobTitle: { label: "Full Stack Developer" },
            Company: { label: "Amazon" },
          },
        ];
        (prisma.job.findMany as jest.Mock).mockResolvedValue(mockFilteredData);
        (prisma.job.count as jest.Mock).mockResolvedValue(1);

        const result = await getJobsList(1, 10, undefined, "Amazon");

        expect(result).toEqual({
          success: true,
          data: mockFilteredData,
          total: 1,
        });
      });

      it("should combine job type filter with search", async () => {
        (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
        (prisma.job.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.job.count as jest.Mock).mockResolvedValue(0);

        await getJobsList(1, 10, "PT", "Developer");

        const findManyCall = (prisma.job.findMany as jest.Mock).mock
          .calls[0][0];
        expect(findManyCall.where).toMatchObject({
          userId: mockUser.id,
          jobType: "PT",
          OR: expect.any(Array),
        });
      });
    });
  });
  describe("getJobDetails", () => {
    it("should throw error when jobId is not provided", async () => {
      await expect(getJobDetails("")).resolves.toStrictEqual({
        success: false,
        message: "Failed to fetch job details. ",
      });
    });
    it("should throw error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      await expect(getJobDetails("job123")).resolves.toStrictEqual({
        success: false,
        message: "Failed to fetch job details. ",
      });
    });
  });
  it("should return job details on successful query", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    const mockJob = await getMockJobDetails("2");
    (prisma.job.findFirst as jest.Mock).mockResolvedValue(mockJob);

    const result = await getJobDetails("2");

    expect(result).toStrictEqual({ data: mockJob, success: true });
    expect(prisma.job.findFirst).toHaveBeenCalledWith({
      where: {
        id: "2",
        userId: mockUser.id,
      },
      include: {
        JobSource: true,
        JobTitle: true,
        Company: true,
        Status: true,
        Location: true,
        Resume: {
          include: {
            File: { select: { id: true, fileName: true, fileType: true } },
          },
        },
        tags: true,
      },
    });
  });

  it("should handle unexpected errors", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user123" });

    (prisma.job.findFirst as jest.Mock).mockRejectedValue(
      new Error("Unexpected error"),
    );

    await expect(getJobDetails("job123")).resolves.toStrictEqual({
      success: false,
      message: "Failed to fetch job details. ",
    });
  });
  it("should throw error when user is not authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    await expect(getJobDetails("job123")).resolves.toStrictEqual({
      success: false,
      message: "Failed to fetch job details. ",
    });
  });
  describe("createLocation", () => {
    it("should throw error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      await expect(createLocation("location-name")).resolves.toStrictEqual({
        success: false,
        message: "Failed to create job location. ",
      });
    });
    it("should throw error when location name is not provided or empty", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      await expect(createLocation(" ")).resolves.toStrictEqual({
        success: false,
        message: "Failed to create job location. ",
      });
    });
    it("should create with valid input", async () => {
      const label = "New Location";
      const mockLocation = {
        label: "New Location",
        value: "new location",
        createdBy: mockUser.id,
      };
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.location.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.location.create as jest.Mock).mockResolvedValue(mockLocation);

      const result = await createLocation(label);

      expect(prisma.location.create).toHaveBeenCalledTimes(1);
      expect(prisma.location.create).toHaveBeenCalledWith({
        data: mockLocation,
      });
      expect(result).toStrictEqual({
        data: {
          ...mockLocation,
        },
        success: true,
      });
    });
    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.location.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.location.create as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(createLocation("location-name")).resolves.toStrictEqual({
        success: false,
        message: "Failed to create job location. ",
      });
    });
  });
  describe("addJob", () => {
    const createdJob = {
      ...jobData,
      id: "new-job-id",
      Status: { id: "status-id", label: "Bookmarked", value: "bookmarked" },
    };
    const historyEntry = { id: "history-1" };

    it("should create a new job with initial status history", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      // FK ownership verification mocks (CON-C01)
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            create: jest.fn().mockResolvedValue(createdJob),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue(historyEntry),
          },
        });
      });

      const result = await addJob(jobData);

      expect(result).toStrictEqual({ data: createdJob, success: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
    it("should emit JobStatusChanged event after creation", async () => {
      const { emitEvent } = require("@/lib/events");
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      // FK ownership verification mocks (CON-C01)
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            create: jest.fn().mockResolvedValue(createdJob),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue(historyEntry),
          },
        });
      });

      await addJob(jobData);

      expect(emitEvent).toHaveBeenCalledTimes(1);
    });
    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      // FK ownership verification mocks (CON-C01)
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });

      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(addJob(jobData)).resolves.toStrictEqual({
        success: false,
        message: "Failed to create job. ",
      });
    });
    it("should throw error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      await expect(addJob(jobData)).resolves.toStrictEqual({
        success: false,
        message: "Failed to create job. ",
      });
    });
  });
  describe("updateJob", () => {
    it("should update a job successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      // FK ownership verification mocks (CON-C01)
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });
      (prisma.job.update as jest.Mock).mockResolvedValue(jobData);

      const result = await updateJob(jobData);

      expect(result).toStrictEqual({ data: jobData, success: true });
      expect(prisma.job.update).toHaveBeenCalledTimes(1);
    });
    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      // FK ownership verification mocks (CON-C01)
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });

      (prisma.job.update as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(updateJob(jobData)).resolves.toStrictEqual({
        success: false,
        message: "Failed to update job. ",
      });
    });
    it("should throw error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      await expect(updateJob(jobData)).resolves.toStrictEqual({
        success: false,
        message: "Failed to update job. ",
      });
    });

    it("should return an error if the id is not provided or no user privileges", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        updateJob({ ...jobData, id: undefined }),
      ).resolves.toStrictEqual({
        success: false,
        message: "Failed to update job. ",
      });
    });
  });
  describe("updateJobStatus", () => {
    const statusObj = {
      id: "status-applied",
      label: "Applied",
      value: "applied",
    };
    const currentJob = {
      id: "job-id",
      statusId: "status-bookmarked",
      Status: { id: "status-bookmarked", label: "Bookmarked", value: "bookmarked" },
      appliedDate: null,
    };
    const updatedJob = {
      ...currentJob,
      statusId: statusObj.id,
      Status: statusObj,
    };
    const historyEntry = { id: "history-1" };

    it("should delegate to changeJobStatus (state machine path)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(currentJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(statusObj);
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

      const result = await updateJobStatus("job-id", statusObj);

      expect(result.success).toBe(true);
      // Verify it went through changeJobStatus by checking $transaction was called
      // (the old updateJobStatus used prisma.job.update directly)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
    it("should throw error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      await expect(
        updateJobStatus("job-id", statusObj),
      ).resolves.toStrictEqual({
        success: false,
        message: "Failed to change job status.",
      });
    });
  });
  // ---------------------------------------------------------------------------
  // F5: updateJob must enforce state machine when status changes
  // ---------------------------------------------------------------------------

  describe("updateJob — state machine enforcement (F5)", () => {
    const bookmarkedStatus = {
      id: "status-bookmarked",
      label: "Bookmarked",
      value: "bookmarked",
    };
    const offerStatus = {
      id: "status-offer",
      label: "Offer",
      value: "offer",
    };

    const existingJob = {
      id: "job-id",
      userId: mockUser.id,
      statusId: bookmarkedStatus.id,
      Status: bookmarkedStatus,
    };

    const updateData = {
      ...jobData,
      id: "job-id",
      status: offerStatus.id, // Attempting bookmarked -> offer (INVALID)
    };

    it("should reject invalid status transition (bookmarked -> offer) via edit form", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      // FK ownership verification mocks (CON-C01)
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });

      // Mock: fetch the current job to check its current status
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(existingJob);
      // Mock: fetch the target status to get its value
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(offerStatus);

      const result = await updateJob(updateData);

      // updateJob should validate the state machine BEFORE writing to DB.
      // bookmarked -> offer is NOT a valid transition.
      expect(result.success).toBe(false);

      // Prisma update should NOT have been called since the transition is invalid
      expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it("should allow valid status transition (bookmarked -> applied) via edit form", async () => {
      const appliedStatus = {
        id: "status-applied",
        label: "Applied",
        value: "applied",
      };
      const validUpdateData = {
        ...jobData,
        id: "job-id",
        status: appliedStatus.id, // bookmarked -> applied (VALID)
      };

      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(existingJob);
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(appliedStatus);

      (prisma.job.update as jest.Mock).mockResolvedValue({
        ...existingJob,
        statusId: appliedStatus.id,
        Status: appliedStatus,
      });

      const result = await updateJob(validUpdateData);

      // Valid transition should proceed
      expect(result.success).toBe(true);
      expect(prisma.job.update).toHaveBeenCalledTimes(1);
    });

    it("should allow update without status change (same status)", async () => {
      const sameStatusData = {
        ...jobData,
        id: "job-id",
        status: bookmarkedStatus.id, // same status, no transition
      };

      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });
      (prisma.job.findFirst as jest.Mock).mockResolvedValue(existingJob);

      (prisma.job.update as jest.Mock).mockResolvedValue(existingJob);

      const result = await updateJob(sameStatusData);

      // Same status = no transition needed, should succeed
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // F8: addJob should validate statusId exists
  // ---------------------------------------------------------------------------

  describe("addJob — statusId validation (F8)", () => {
    it("should reject when statusId does not exist in the database", async () => {
      const nonExistentStatusId = "00000000-0000-0000-0000-000000000000";
      const jobDataWithBadStatus = {
        ...jobData,
        status: nonExistentStatusId,
      };

      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      // FK ownership verification mocks (CON-C01)
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });

      // The statusId does NOT exist in the database
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await addJob(jobDataWithBadStatus);

      // addJob should validate statusId before creating the job.
      // A non-existent statusId should be rejected.
      expect(result.success).toBe(false);

      // The job should NOT have been created
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("should validate statusId belongs to a real status before writing to DB", async () => {
      const validStatusId = "status-bookmarked";
      const jobDataWithValidStatus = {
        ...jobData,
        status: validStatusId,
      };

      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.jobTitle.findFirst as jest.Mock).mockResolvedValue({ id: "job-title-id" });
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "company-id" });
      (prisma.location.findFirst as jest.Mock).mockResolvedValue({ id: "location-id" });
      (prisma.jobSource.findFirst as jest.Mock).mockResolvedValue({ id: "source-id" });

      // The statusId DOES exist
      (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue({
        id: validStatusId,
        label: "Bookmarked",
        value: "bookmarked",
      });

      const createdJob = {
        ...jobData,
        id: "new-job-id",
        Status: { id: validStatusId, label: "Bookmarked", value: "bookmarked" },
      };
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
        return fn({
          job: {
            create: jest.fn().mockResolvedValue(createdJob),
          },
          jobStatusHistory: {
            create: jest.fn().mockResolvedValue({ id: "history-1" }),
          },
        });
      });

      const result = await addJob(jobDataWithValidStatus);

      // Valid status should succeed
      expect(result.success).toBe(true);
    });
  });

  describe("deleteJobById", () => {
    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      await expect(deleteJobById("job-id")).resolves.toStrictEqual({
        success: false,
        message: "Failed to delete job.",
      });
    });
    it("should delete a job successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.job.delete as jest.Mock).mockResolvedValue(jobData);

      const result = await deleteJobById("job-id");

      expect(result).toStrictEqual({ success: true });
      expect(prisma.job.delete).toHaveBeenCalledTimes(1);
      expect(prisma.job.delete).toHaveBeenCalledWith({
        where: {
          id: "job-id",
          userId: mockUser.id,
        },
      });
    });
    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      (prisma.job.delete as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(deleteJobById("job-id")).resolves.toStrictEqual({
        success: false,
        message: "Failed to delete job.",
      });
    });
  });
});
