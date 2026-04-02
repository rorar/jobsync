/**
 * RED phase test — Finding DAU-7: Kanban should use getKanbanBoard, not getJobsList
 *
 * The Kanban board component should use getKanbanBoard (which includes tags and
 * has no pagination) rather than getJobsList (which omits tags and is paginated).
 *
 * This file contains:
 * 1. A test that getKanbanBoard returns tags for each job (should PASS — characterization)
 * 2. A test that getJobsList does NOT include tags (should PASS — characterizing the gap)
 * 3. A test that getKanbanBoard returns ALL jobs without pagination (should PASS — characterization)
 * 4. A test that getJobsList returns paginated results (should PASS — characterizing the limitation)
 *
 * The characterization tests document the data-path gap. The real fix is in the
 * component layer (using getKanbanBoard instead of getJobsList), but these tests
 * codify the contract difference between the two functions.
 */

import { getKanbanBoard, getJobsList } from "@/actions/job.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    jobStatus: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    job: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
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
  createEvent: jest.fn(),
  DomainEventTypes: { JobStatusChanged: "JobStatusChanged" },
}));

jest.mock("@/lib/crm/status-machine", () => ({
  isValidTransition: jest.fn().mockReturnValue(true),
  computeTransitionSideEffects: jest.fn().mockReturnValue({}),
  getValidTargets: jest.fn().mockReturnValue([]),
  STATUS_ORDER: [
    "bookmarked",
    "applied",
    "interview",
    "offer",
    "accepted",
    "rejected",
    "archived",
  ],
  COLLAPSED_BY_DEFAULT: ["rejected", "archived"],
}));

describe("Kanban data path — DAU-7 characterization", () => {
  const mockUser = { id: "user-id" };

  const mockStatuses = [
    { id: "s-bookmarked", label: "Bookmarked", value: "bookmarked" },
    { id: "s-applied", label: "Applied", value: "applied" },
    { id: "s-interview", label: "Interview", value: "interview" },
    { id: "s-offer", label: "Offer", value: "offer" },
    { id: "s-accepted", label: "Accepted", value: "accepted" },
    { id: "s-rejected", label: "Rejected", value: "rejected" },
    { id: "s-archived", label: "Archived", value: "archived" },
  ];

  const mockTags = [
    { id: "tag-1", label: "Remote", value: "remote" },
    { id: "tag-2", label: "Urgent", value: "urgent" },
  ];

  /**
   * Build 5 mock jobs with tags, distributed across statuses.
   */
  const mockKanbanJobs = [
    {
      id: "job-1",
      JobTitle: { label: "Frontend Dev" },
      Company: { label: "Acme", logoUrl: null },
      Location: { label: "Berlin" },
      Status: { id: "s-bookmarked", value: "bookmarked", label: "Bookmarked" },
      matchScore: 90,
      dueDate: null,
      tags: [mockTags[0]],
      sortOrder: 0,
      createdAt: new Date("2026-04-01"),
      statusId: "s-bookmarked",
    },
    {
      id: "job-2",
      JobTitle: { label: "Backend Dev" },
      Company: { label: "Beta Inc", logoUrl: null },
      Location: { label: "Remote" },
      Status: { id: "s-applied", value: "applied", label: "Applied" },
      matchScore: 75,
      dueDate: null,
      tags: [mockTags[0], mockTags[1]],
      sortOrder: 1,
      createdAt: new Date("2026-03-31"),
      statusId: "s-applied",
    },
    {
      id: "job-3",
      JobTitle: { label: "DevOps" },
      Company: { label: "Gamma Ltd", logoUrl: null },
      Location: null,
      Status: {
        id: "s-interview",
        value: "interview",
        label: "Interview",
      },
      matchScore: null,
      dueDate: new Date("2026-04-10"),
      tags: [],
      sortOrder: 2,
      createdAt: new Date("2026-03-30"),
      statusId: "s-interview",
    },
    {
      id: "job-4",
      JobTitle: { label: "PM" },
      Company: { label: "Delta Co", logoUrl: "https://example.com/logo.png" },
      Location: { label: "Munich" },
      Status: { id: "s-bookmarked", value: "bookmarked", label: "Bookmarked" },
      matchScore: 60,
      dueDate: null,
      tags: [mockTags[1]],
      sortOrder: 3,
      createdAt: new Date("2026-03-29"),
      statusId: "s-bookmarked",
    },
    {
      id: "job-5",
      JobTitle: { label: "QA Engineer" },
      Company: { label: "Epsilon", logoUrl: null },
      Location: { label: "Hamburg" },
      Status: { id: "s-offer", value: "offer", label: "Offer" },
      matchScore: 85,
      dueDate: null,
      tags: [mockTags[0]],
      sortOrder: 4,
      createdAt: new Date("2026-03-28"),
      statusId: "s-offer",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  // ---------------------------------------------------------------------------
  // getKanbanBoard — CHARACTERIZATION (should PASS, documenting correct path)
  // ---------------------------------------------------------------------------

  describe("getKanbanBoard includes tags (correct data path)", () => {
    beforeEach(() => {
      (prisma.jobStatus.findMany as jest.Mock).mockResolvedValue(mockStatuses);
      (prisma.job.findMany as jest.Mock).mockResolvedValue(mockKanbanJobs);
    });

    it("should include tags array for each job in the Kanban board", async () => {
      const result = await getKanbanBoard();
      expect(result.success).toBe(true);

      // Flatten all jobs from all columns
      const allJobs = result.data!.columns.flatMap((col) => col.jobs);

      // Every job should have a tags property that is an array
      for (const job of allJobs) {
        expect(job).toHaveProperty("tags");
        expect(Array.isArray(job.tags)).toBe(true);
      }

      // Specifically, job-1 should have the "Remote" tag
      const job1 = allJobs.find((j) => j.id === "job-1");
      expect(job1).toBeDefined();
      expect(job1!.tags).toHaveLength(1);
      expect(job1!.tags[0].label).toBe("Remote");

      // job-2 should have 2 tags
      const job2 = allJobs.find((j) => j.id === "job-2");
      expect(job2).toBeDefined();
      expect(job2!.tags).toHaveLength(2);
    });

    it("should return ALL jobs without pagination", async () => {
      const result = await getKanbanBoard();
      expect(result.success).toBe(true);

      const allJobs = result.data!.columns.flatMap((col) => col.jobs);
      // All 5 jobs should be present (no pagination limit)
      expect(allJobs).toHaveLength(5);
    });
  });

  // ---------------------------------------------------------------------------
  // getJobsList — CHARACTERIZATION (should PASS, documenting the gap)
  // ---------------------------------------------------------------------------

  describe("getJobsList omits tags (characterizing the gap)", () => {
    it("should NOT include tags in the select for list view jobs", async () => {
      const mockListJobs = mockKanbanJobs.map(({ tags, ...rest }) => rest);
      (prisma.job.findMany as jest.Mock).mockResolvedValue(mockListJobs);
      (prisma.job.count as jest.Mock).mockResolvedValue(5);

      const result = await getJobsList(1, 10);
      expect(result.success).toBe(true);

      // The Prisma mock returns whatever we give it. The important assertion is
      // that the findMany call does NOT request tags in its select clause.
      const findManyCall = (prisma.job.findMany as jest.Mock).mock.calls[0][0];
      const selectKeys = Object.keys(findManyCall.select);
      expect(selectKeys).not.toContain("tags");
    });

    it("should apply pagination (take/skip), unlike getKanbanBoard", async () => {
      (prisma.job.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.job.count as jest.Mock).mockResolvedValue(50);

      await getJobsList(2, 10);

      const findManyCall = (prisma.job.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.skip).toBe(10); // page 2, 10 per page
      expect(findManyCall.take).toBe(10);
    });
  });
});
