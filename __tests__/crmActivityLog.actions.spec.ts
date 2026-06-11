/**
 * crmActivityLog.actions.spec.ts — Welle 3 Phase 3 (Gap-5), Task 3.1
 *
 * getActivityTimeline: the targetCompanyId filter (company timeline) and the
 * ADR-015 IDOR guarantee that userId always scopes the query.
 */

import { getActivityTimeline } from "@/actions/crmActivityLog.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

jest.mock("@prisma/client", () => {
  const m = {
    crmActivityLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));

const prisma = new PrismaClient();
const mockUser = { id: "user-1", name: "T", email: "t@e.test" };

beforeEach(() => jest.clearAllMocks());

describe("getActivityTimeline", () => {
  it("rejects an unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const result = await getActivityTimeline({ targetCompanyId: "c1" });
    expect(result.success).toBe(false);
  });

  it("filters by targetCompanyId AND always scopes by userId (IDOR)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    await getActivityTimeline({ targetCompanyId: "company-1" });

    expect(prisma.crmActivityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", targetCompanyId: "company-1" },
      }),
    );
  });

  it("combines targetJobId + targetCompanyId for the Job CRM tab", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    await getActivityTimeline({ targetJobId: "job-1", targetCompanyId: "company-1" });

    expect(prisma.crmActivityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          targetJobId: "job-1",
          targetCompanyId: "company-1",
        },
      }),
    );
  });

  it("omits the company filter when not provided (still userId-scoped)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    await getActivityTimeline({ targetPersonId: "person-1" });

    expect(prisma.crmActivityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", targetPersonId: "person-1" },
      }),
    );
  });
});
