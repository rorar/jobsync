/**
 * profile.actions.spec.ts — Tests for deleteResumeById cascade completeness.
 *
 * Verifies that the $transaction inside deleteResumeById deletes ALL child
 * models of ResumeSection (including LicenseOrCertification and OtherSection)
 * BEFORE deleting resumeSection rows, preventing FK constraint errors.
 */

// ---------------------------------------------------------------------------
// Mock @/lib/db — interactive $transaction executes the callback with the
// same mock prisma so we can verify inner deleteMany calls.
// ---------------------------------------------------------------------------
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    resume: {
      findFirst: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    automation: { count: jest.fn().mockResolvedValue(0) },
    contactInfo: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    summary: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    workExperience: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    education: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    licenseOrCertification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    otherSection: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    resumeSection: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";

describe("deleteResumeById — cascade completeness", () => {
  const mockUser = { id: "user-1" };
  const resumeId = "resume-123";

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.resume.findFirst as jest.Mock).mockResolvedValue({
      id: resumeId,
      profileId: "profile-1",
    });

    // Interactive $transaction: execute the callback with the same mock prisma
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) => {
        return callback(prisma);
      },
    );
  });

  it("deletes LicenseOrCertification rows scoped by resumeSectionId before resumeSection", async () => {
    const { deleteResumeById } = require("@/actions/profile.actions");
    await deleteResumeById(resumeId);

    expect(
      (prisma as any).licenseOrCertification.deleteMany,
    ).toHaveBeenCalledWith({ where: { ResumeSection: { resumeId } } });
  });

  it("deletes OtherSection rows scoped by resumeSectionId before resumeSection", async () => {
    const { deleteResumeById } = require("@/actions/profile.actions");
    await deleteResumeById(resumeId);

    expect(
      (prisma as any).otherSection.deleteMany,
    ).toHaveBeenCalledWith({ where: { ResumeSection: { resumeId } } });
  });

  it("deletes child models BEFORE resumeSection.deleteMany", async () => {
    const callOrder: string[] = [];
    const makeTracker = (name: string) =>
      jest.fn().mockImplementation(() => {
        callOrder.push(name);
        return Promise.resolve({ count: 0 });
      });

    (prisma.contactInfo.deleteMany as jest.Mock).mockImplementation(
      makeTracker("contactInfo"),
    );
    (prisma.summary.deleteMany as jest.Mock).mockImplementation(
      makeTracker("summary"),
    );
    (prisma.workExperience.deleteMany as jest.Mock).mockImplementation(
      makeTracker("workExperience"),
    );
    (prisma.education.deleteMany as jest.Mock).mockImplementation(
      makeTracker("education"),
    );
    ((prisma as any).licenseOrCertification.deleteMany as jest.Mock).mockImplementation(
      makeTracker("licenseOrCertification"),
    );
    ((prisma as any).otherSection.deleteMany as jest.Mock).mockImplementation(
      makeTracker("otherSection"),
    );
    (prisma.resumeSection.deleteMany as jest.Mock).mockImplementation(
      makeTracker("resumeSection"),
    );
    (prisma.resume.delete as jest.Mock).mockImplementation(
      makeTracker("resume"),
    );

    const { deleteResumeById } = require("@/actions/profile.actions");
    await deleteResumeById(resumeId);

    const resumeSectionIdx = callOrder.indexOf("resumeSection");
    const licenseIdx = callOrder.indexOf("licenseOrCertification");
    const otherIdx = callOrder.indexOf("otherSection");

    expect(licenseIdx).toBeGreaterThanOrEqual(0);
    expect(otherIdx).toBeGreaterThanOrEqual(0);
    expect(licenseIdx).toBeLessThan(resumeSectionIdx);
    expect(otherIdx).toBeLessThan(resumeSectionIdx);
  });
});

describe("deleteResumeById — Automation guard", () => {
  const mockUser = { id: "user-1" };
  const resumeId = "resume-123";

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.resume.findFirst as jest.Mock).mockResolvedValue({
      id: resumeId,
      profileId: "profile-1",
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) => {
        return callback(prisma);
      },
    );
  });

  it("returns error when resume has referencing Automations", async () => {
    (prisma.automation.count as jest.Mock).mockResolvedValue(2);

    const { deleteResumeById } = require("@/actions/profile.actions");
    const result = await deleteResumeById(resumeId);

    expect(result.success).toBe(false);
    expect(result.message).toContain("resumeHasAutomations");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("proceeds with deletion when resume has zero Automations", async () => {
    (prisma.automation.count as jest.Mock).mockResolvedValue(0);

    const { deleteResumeById } = require("@/actions/profile.actions");
    const result = await deleteResumeById(resumeId);

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
