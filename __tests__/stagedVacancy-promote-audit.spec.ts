/**
 * Welle 1 (S6a) — Promote-staged-vacancy GDPR audit trail.
 *
 * `promoteStagedVacancyToJob` creates a Job from a staged vacancy and MUST emit
 * exactly one `job.create` data-audit entry whose targetId is the newly created
 * jobId (specs/audit-trail.allium AuditJobCreate).
 *
 * Strategy: mock the promoter (the actual job-creation work) so we can drive the
 * returned jobId, mock the data-audit writer, and assert the wiring.
 */

jest.mock("server-only", () => ({}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/connector/job-discovery/promoter", () => ({
  promoteStagedVacancy: jest.fn(),
}));

jest.mock("@/lib/audit/data-audit", () => ({
  writeDataAuditLog: jest.fn(),
}));

jest.mock("@/lib/events", () => ({
  emitEvent: jest.fn(),
  createEvent: jest.fn((type: string, payload: unknown) => ({ type, payload, timestamp: new Date() })),
}));

jest.mock("@/lib/undo", () => ({
  undoStore: { register: jest.fn() },
  createUndoEntry: jest.fn(),
}));

import { promoteStagedVacancyToJob } from "@/actions/stagedVacancy.actions";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
import { getCurrentUser } from "@/utils/user.utils";
import { promoteStagedVacancy } from "@/lib/connector/job-discovery/promoter";

const auditMock = writeDataAuditLog as jest.Mock;
const promoteMock = promoteStagedVacancy as jest.Mock;

describe("promoteStagedVacancyToJob → job.create audit (S6a)", () => {
  const mockUser = { id: "user-id", email: "user@example.com" };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  it("writes one job.create audit entry with targetId = created jobId", async () => {
    promoteMock.mockResolvedValue({ jobId: "new-job-id", stagedVacancyId: "sv-1" });

    const result = await promoteStagedVacancyToJob({ stagedVacancyId: "sv-1" } as never);

    expect(result.success).toBe(true);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: mockUser.id,
        actorEmail: mockUser.email,
        action: "job.create",
        targetType: "job",
        targetId: "new-job-id",
      }),
    );
  });

  it("does not write an audit entry when promotion fails", async () => {
    promoteMock.mockRejectedValue(new Error("boom"));

    const result = await promoteStagedVacancyToJob({ stagedVacancyId: "sv-1" } as never);

    expect(result.success).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("does not write an audit entry when unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await promoteStagedVacancyToJob({ stagedVacancyId: "sv-1" } as never);

    expect(result.success).toBe(false);
    expect(promoteMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});
