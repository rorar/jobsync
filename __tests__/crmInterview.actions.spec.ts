import {
  scheduleInterview,
  completeInterview,
  cancelInterview,
  rescheduleInterview,
  getInterviews,
} from "@/actions/crmInterview.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    job: { findFirst: jest.fn() },
    person: { findFirst: jest.fn() },
    crmInterview: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    crmActivityLog: { create: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/events", () => ({ eventBus: { publish: jest.fn() } }));
jest.mock("@/lib/events/event-types", () => ({
  createEvent: jest.fn((_type: string, payload: unknown) => ({ type: _type, payload })),
  DomainEventType: {
    InterviewScheduled: "InterviewScheduled",
    InterviewCompleted: "InterviewCompleted",
  },
}));

// isValidInterviewTransition is a pure function — let it run from the real module
// so state-machine tests reflect actual domain rules:
//   scheduled   → completed | cancelled | rescheduled
//   rescheduled → completed | cancelled | rescheduled (G17 self-transition)
//   completed   → (terminal)
//   cancelled   → (terminal)
jest.mock("@/models/person.model", () => {
  const actual = jest.requireActual("@/models/person.model");
  return actual;
});

const prisma = new PrismaClient();
const mockUser = { id: "user-id", name: "Test User", email: "test@example.com" };

const FUTURE_DATE = "2026-09-15T10:00:00.000Z";

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// scheduleInterview
// ---------------------------------------------------------------------------

describe("scheduleInterview", () => {
  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await scheduleInterview({ jobId: "job-1", interviewDate: FUTURE_DATE });

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("rejects if job not found", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await scheduleInterview({ jobId: "job-missing", interviewDate: FUTURE_DATE });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.jobNotFound");
  });

  it("rejects if person not found when personId provided", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({
      id: "job-1",
      description: "Backend role",
      JobTitle: { label: "Engineer" },
    });
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await scheduleInterview({
      jobId: "job-1",
      personId: "person-missing",
      interviewDate: FUTURE_DATE,
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotFound");
  });

  it("GDPR Art. 7(3): rejects when the person has withdrawn consent", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({
      id: "job-1",
      description: "Backend role",
      JobTitle: { label: "Engineer" },
    });
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({
      id: "person-1",
      processingBasis: "consent",
      consentWithdrawnAt: new Date(),
    });

    const result = await scheduleInterview({
      jobId: "job-1",
      personId: "person-1",
      interviewDate: FUTURE_DATE,
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.consentWithdrawn");
    expect(prisma.crmInterview.create).not.toHaveBeenCalled();
  });

  it("creates interview with status scheduled", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({
      id: "job-1",
      description: "Backend role",
      JobTitle: { label: "Engineer" },
    });
    (prisma.crmInterview.create as jest.Mock).mockResolvedValue({ id: "interview-1" });
    (prisma.crmActivityLog.create as jest.Mock).mockResolvedValue({});

    const result = await scheduleInterview({
      jobId: "job-1",
      interviewDate: FUTURE_DATE,
      location: "Berlin HQ",
    });

    expect(result.success).toBe(true);
    expect((result as { success: true; data: { id: string } }).data).toEqual({ id: "interview-1" });
    expect(prisma.crmInterview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: mockUser.id,
          jobId: "job-1",
          status: "scheduled",
          location: "Berlin HQ",
        }),
      }),
    );
  });

  it("activity log projected via InterviewScheduled event (consumer handles write)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({
      id: "job-1",
      description: "Backend role",
      JobTitle: { label: "Engineer" },
    });
    (prisma.crmInterview.create as jest.Mock).mockResolvedValue({ id: "interview-1" });

    await scheduleInterview({ jobId: "job-1", interviewDate: FUTURE_DATE });

    // Activity log is now written by crm-activity-logger consumer, not the action directly
    expect(eventBus.publish).toHaveBeenCalled();
    expect(prisma.crmActivityLog.create).not.toHaveBeenCalled();
  });

  it("publishes InterviewScheduled event", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({
      id: "job-1",
      description: "Backend role",
      JobTitle: { label: "Engineer" },
    });
    (prisma.crmInterview.create as jest.Mock).mockResolvedValue({ id: "interview-1" });
    (prisma.crmActivityLog.create as jest.Mock).mockResolvedValue({});

    await scheduleInterview({ jobId: "job-1", interviewDate: FUTURE_DATE });

    expect(createEvent).toHaveBeenCalledWith(
      DomainEventType.InterviewScheduled,
      expect.objectContaining({
        interviewId: "interview-1",
        jobId: "job-1",
        userId: mockUser.id,
        interviewDate: FUTURE_DATE,
      }),
    );
    expect(eventBus.publish).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// completeInterview
// ---------------------------------------------------------------------------

describe("completeInterview", () => {
  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await completeInterview("interview-1", "passed");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("rejects if interview not found", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await completeInterview("interview-missing", "passed");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.interviewNotFound");
  });

  it("rejects invalid transition (cancelled → completed)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue({
      id: "interview-1",
      status: "cancelled",
      jobId: "job-1",
      personId: null,
      job: { id: "job-1", JobTitle: { label: "Engineer" } },
    });

    const result = await completeInterview("interview-1", "passed");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.invalidTransition");
    expect(prisma.crmInterview.update).not.toHaveBeenCalled();
  });

  it("sets status to completed and stores outcome and outcomeNotes", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue({
      id: "interview-1",
      status: "scheduled",
      jobId: "job-1",
      personId: "person-1",
      job: { id: "job-1", JobTitle: { label: "Engineer" } },
    });
    (prisma.crmInterview.update as jest.Mock).mockResolvedValue({ id: "interview-1" });
    (prisma.crmActivityLog.create as jest.Mock).mockResolvedValue({});

    const result = await completeInterview("interview-1", "passed", "Great cultural fit");

    expect(result.success).toBe(true);
    expect((result as { success: true; data: { id: string } }).data).toEqual({ id: "interview-1" });
    expect(prisma.crmInterview.update).toHaveBeenCalledWith({
      where: { id: "interview-1" },
      data: {
        status: "completed",
        outcome: "passed",
        outcomeNotes: "Great cultural fit",
        updatedByType: "user",
        updatedById: mockUser.id,
      },
    });
  });

  it("creates activity log entry after completion", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue({
      id: "interview-1",
      status: "scheduled",
      jobId: "job-1",
      personId: "person-1",
      job: { id: "job-1", JobTitle: { label: "Engineer" } },
    });
    (prisma.crmInterview.update as jest.Mock).mockResolvedValue({ id: "interview-1" });

    await completeInterview("interview-1", "passed");

    // Activity log is now written by crm-activity-logger consumer
    expect(eventBus.publish).toHaveBeenCalled();
    expect(prisma.crmActivityLog.create).not.toHaveBeenCalled();
  });

  it("publishes InterviewCompleted event", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue({
      id: "interview-1",
      status: "scheduled",
      jobId: "job-1",
      personId: null,
      job: { id: "job-1", JobTitle: { label: "Engineer" } },
    });
    (prisma.crmInterview.update as jest.Mock).mockResolvedValue({ id: "interview-1" });
    (prisma.crmActivityLog.create as jest.Mock).mockResolvedValue({});

    await completeInterview("interview-1", "rejected");

    expect(createEvent).toHaveBeenCalledWith(
      DomainEventType.InterviewCompleted,
      expect.objectContaining({
        interviewId: "interview-1",
        jobId: "job-1",
        userId: mockUser.id,
        outcome: "rejected",
      }),
    );
    expect(eventBus.publish).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cancelInterview
// ---------------------------------------------------------------------------

describe("cancelInterview", () => {
  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await cancelInterview("interview-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("rejects if interview not found", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await cancelInterview("interview-missing");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.interviewNotFound");
  });

  it("rejects invalid transition (completed → cancelled)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue({
      id: "interview-1",
      status: "completed",
    });

    const result = await cancelInterview("interview-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.invalidTransition");
    expect(prisma.crmInterview.update).not.toHaveBeenCalled();
  });

  it("sets status to cancelled", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue({
      id: "interview-1",
      status: "scheduled",
    });
    (prisma.crmInterview.update as jest.Mock).mockResolvedValue({ id: "interview-1" });

    const result = await cancelInterview("interview-1");

    expect(result.success).toBe(true);
    expect((result as { success: true; data: { id: string } }).data).toEqual({ id: "interview-1" });
    expect(prisma.crmInterview.update).toHaveBeenCalledWith({
      where: { id: "interview-1" },
      data: { status: "cancelled", updatedByType: "user", updatedById: mockUser.id },
    });
  });
});

// ---------------------------------------------------------------------------
// rescheduleInterview
// ---------------------------------------------------------------------------

describe("rescheduleInterview", () => {
  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await rescheduleInterview("interview-1", FUTURE_DATE);

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("rejects if interview not found", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await rescheduleInterview("interview-missing", FUTURE_DATE);

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.interviewNotFound");
  });

  it("allows rescheduled → rescheduled self-transition (G17)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue({
      id: "interview-1",
      status: "rescheduled",
      location: "Berlin HQ",
    });
    (prisma.crmInterview.update as jest.Mock).mockResolvedValue({
      id: "interview-1",
      status: "rescheduled",
    });

    const result = await rescheduleInterview("interview-1", FUTURE_DATE);

    expect(result.success).toBe(true);
    expect(prisma.crmInterview.update).toHaveBeenCalled();
  });

  it("updates date and location, sets status to rescheduled", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findFirst as jest.Mock).mockResolvedValue({
      id: "interview-1",
      status: "scheduled",
      location: "Berlin HQ",
    });
    (prisma.crmInterview.update as jest.Mock).mockResolvedValue({ id: "interview-1" });

    const NEW_DATE = "2026-10-01T14:00:00.000Z";
    const result = await rescheduleInterview("interview-1", NEW_DATE, "Hamburg Office");

    expect(result.success).toBe(true);
    expect((result as { success: true; data: { id: string } }).data).toEqual({ id: "interview-1" });
    expect(prisma.crmInterview.update).toHaveBeenCalledWith({
      where: { id: "interview-1" },
      data: {
        status: "rescheduled",
        interviewDate: new Date(NEW_DATE),
        location: "Hamburg Office",
        updatedByType: "user",
        updatedById: mockUser.id,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// getInterviews
// ---------------------------------------------------------------------------

describe("getInterviews", () => {
  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await getInterviews();

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("returns interviews with job and person includes", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    const mockInterviews = [
      {
        id: "interview-1",
        jobId: "job-1",
        personId: "person-1",
        status: "scheduled",
        interviewDate: new Date(FUTURE_DATE),
        job: { id: "job-1", JobTitle: { label: "Engineer" }, Company: { label: "Acme" } },
        person: { id: "person-1", firstName: "Jane", lastName: "Doe" },
      },
    ];
    (prisma.crmInterview.findMany as jest.Mock).mockResolvedValue(mockInterviews);

    const result = await getInterviews();

    expect(result.success).toBe(true);
    expect((result as { success: true; data: unknown[] }).data).toEqual(mockInterviews);
    expect(prisma.crmInterview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: mockUser.id },
      }),
    );
  });

  it("filters by upcoming (interviewDate >= now, status in scheduled|rescheduled)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.crmInterview.findMany as jest.Mock).mockResolvedValue([]);

    await getInterviews({ upcoming: true });

    expect(prisma.crmInterview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: mockUser.id,
          interviewDate: expect.objectContaining({ gte: expect.any(Date) }),
          status: { in: ["scheduled", "rescheduled"] },
        }),
      }),
    );
  });
});
