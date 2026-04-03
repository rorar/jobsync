/**
 * DAU-7: Kanban data path — getKanbanBoard vs getJobsList
 *
 * Tests for the dedicated Kanban data path:
 * 1. getKanbanBoard returns tags for each job (correct data path)
 * 2. getKanbanBoard returns ALL jobs without pagination
 * 3. getKanbanBoard groups jobs by status
 * 4. getKanbanBoard enforces IDOR protection (userId in where clause)
 * 5. getJobsList does NOT include tags (characterizing the list/table gap)
 * 6. getJobsList applies pagination (take/skip)
 *
 * The component layer (JobsContainer) now uses getKanbanBoard for Kanban view
 * and getJobsList for table view, each with the appropriate data shape.
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
  // getKanbanBoard — Correct data path (all jobs, with tags, grouped by status)
  // ---------------------------------------------------------------------------

  describe("getKanbanBoard (dedicated Kanban data path)", () => {
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

    it("should group jobs by status into columns", async () => {
      const result = await getKanbanBoard();
      expect(result.success).toBe(true);

      const columns = result.data!.columns;

      // Bookmarked column should have 2 jobs (job-1, job-4)
      const bookmarked = columns.find((c) => c.statusValue === "bookmarked");
      expect(bookmarked).toBeDefined();
      expect(bookmarked!.jobs).toHaveLength(2);
      expect(bookmarked!.jobCount).toBe(2);

      // Applied column should have 1 job (job-2)
      const applied = columns.find((c) => c.statusValue === "applied");
      expect(applied).toBeDefined();
      expect(applied!.jobs).toHaveLength(1);
      expect(applied!.jobs[0].id).toBe("job-2");

      // Interview column should have 1 job (job-3)
      const interview = columns.find((c) => c.statusValue === "interview");
      expect(interview).toBeDefined();
      expect(interview!.jobs).toHaveLength(1);

      // Offer column should have 1 job (job-5)
      const offer = columns.find((c) => c.statusValue === "offer");
      expect(offer).toBeDefined();
      expect(offer!.jobs).toHaveLength(1);

      // Empty columns should exist with 0 jobs
      const accepted = columns.find((c) => c.statusValue === "accepted");
      expect(accepted).toBeDefined();
      expect(accepted!.jobs).toHaveLength(0);
      expect(accepted!.jobCount).toBe(0);
    });

    it("should enforce IDOR protection with userId in where clause", async () => {
      await getKanbanBoard();

      // Verify job.findMany was called with userId filter
      const findManyCall = (prisma.job.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where).toEqual({ userId: mockUser.id });
    });

    it("should use explicit select (not include) for Kanban jobs", async () => {
      await getKanbanBoard();

      const findManyCall = (prisma.job.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall).toHaveProperty("select");
      expect(findManyCall).not.toHaveProperty("include");

      // Verify critical select fields
      const select = findManyCall.select;
      expect(select.id).toBe(true);
      expect(select.tags).toBeDefined();
      expect(select.matchScore).toBe(true);
      expect(select.dueDate).toBe(true);
      expect(select.sortOrder).toBe(true);
    });

    it("should not apply pagination (no skip/take)", async () => {
      await getKanbanBoard();

      const findManyCall = (prisma.job.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.skip).toBeUndefined();
      expect(findManyCall.take).toBeUndefined();
    });

    it("should return error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getKanbanBoard();
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getJobsList — Table view data path (paginated, no tags)
  // ---------------------------------------------------------------------------

  describe("getJobsList (table view data path)", () => {
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
