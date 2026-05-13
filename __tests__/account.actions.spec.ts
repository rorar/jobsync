import { deleteAccount } from "@/actions/account.actions";

// Mock auth
const mockGetCurrentUser = jest.fn();
jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock Prisma with all models used in deleteAccount
const mockDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const mockDelete = jest.fn().mockResolvedValue({});

// Create a transaction mock that passes the tx object
const mockTransaction = jest.fn().mockImplementation(async (fn) => {
  const tx = {
    workExperience: { deleteMany: mockDeleteMany },
    education: { deleteMany: mockDeleteMany },
    licenseOrCertification: { deleteMany: mockDeleteMany },
    otherSection: { deleteMany: mockDeleteMany },
    contactInfo: { deleteMany: mockDeleteMany },
    resumeSection: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: mockDeleteMany,
    },
    summary: { deleteMany: mockDeleteMany },
    file: { deleteMany: mockDeleteMany },
    resume: { deleteMany: mockDeleteMany },
    activity: { deleteMany: mockDeleteMany },
    automation: { deleteMany: mockDeleteMany },
    crmTaskTarget: { deleteMany: mockDeleteMany },
    crmNoteTarget: { deleteMany: mockDeleteMany },
    contact: { deleteMany: mockDeleteMany },
    interview: { deleteMany: mockDeleteMany },
    user: { delete: mockDelete },
  };
  return fn(tx);
});

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    logoAsset: { findMany: jest.fn().mockResolvedValue([]) },
    file: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Mock fs
jest.mock("fs", () => ({
  promises: {
    unlink: jest.fn().mockResolvedValue(undefined),
    rm: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("deleteAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns error when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await deleteAccount();
    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("deletes user in a transaction when authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
    });
    const result = await deleteAccount();
    expect(result.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("collects file paths before deletion", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
    });
    const prisma = require("@/lib/db").default;
    prisma.logoAsset.findMany.mockResolvedValue([
      { filePath: "/data/logos/user-1/c1/logo.png" },
    ]);
    prisma.file.findMany.mockResolvedValue([
      { filePath: "/uploads/resume.pdf" },
    ]);

    await deleteAccount();

    expect(prisma.logoAsset.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { filePath: true },
    });
  });

  it("cleans up disk files after DB deletion succeeds", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
    });
    const prisma = require("@/lib/db").default;
    prisma.logoAsset.findMany.mockResolvedValue([
      { filePath: "/data/logos/user-1/c1/logo.png" },
    ]);
    prisma.file.findMany.mockResolvedValue([
      { filePath: "/uploads/resume.pdf" },
    ]);

    const fsPromises = require("fs").promises;
    await deleteAccount();

    expect(fsPromises.rm).toHaveBeenCalledWith(
      expect.stringContaining("user-1"),
      { recursive: true, force: true },
    );
  });

  it("deletes automations before resumes (Restrict FK)", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
    });

    const callOrder: string[] = [];
    mockTransaction.mockImplementationOnce(async (fn) => {
      const trackedDeleteMany = (label: string) =>
        jest.fn().mockImplementation(async () => {
          callOrder.push(label);
          return { count: 0 };
        });

      const tx = {
        workExperience: { deleteMany: trackedDeleteMany("workExperience") },
        education: { deleteMany: trackedDeleteMany("education") },
        licenseOrCertification: {
          deleteMany: trackedDeleteMany("licenseOrCertification"),
        },
        otherSection: { deleteMany: trackedDeleteMany("otherSection") },
        contactInfo: { deleteMany: trackedDeleteMany("contactInfo") },
        resumeSection: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: trackedDeleteMany("resumeSection"),
        },
        summary: { deleteMany: trackedDeleteMany("summary") },
        file: { deleteMany: trackedDeleteMany("file") },
        resume: { deleteMany: trackedDeleteMany("resume") },
        activity: { deleteMany: trackedDeleteMany("activity") },
        automation: { deleteMany: trackedDeleteMany("automation") },
        crmTaskTarget: { deleteMany: trackedDeleteMany("crmTaskTarget") },
        crmNoteTarget: { deleteMany: trackedDeleteMany("crmNoteTarget") },
        contact: { deleteMany: trackedDeleteMany("contact") },
        interview: { deleteMany: trackedDeleteMany("interview") },
        user: {
          delete: jest.fn().mockImplementation(async () => {
            callOrder.push("user");
            return {};
          }),
        },
      };
      return fn(tx);
    });

    await deleteAccount();

    const automationIdx = callOrder.indexOf("automation");
    const resumeIdx = callOrder.indexOf("resume");
    expect(automationIdx).toBeGreaterThanOrEqual(0);
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(automationIdx).toBeLessThan(resumeIdx);
  });

  it("handles summaries with null summaryId gracefully", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
    });

    // Override resumeSection.findMany to return sections with mixed summaryIds
    mockTransaction.mockImplementationOnce(async (fn) => {
      const tx = {
        workExperience: { deleteMany: mockDeleteMany },
        education: { deleteMany: mockDeleteMany },
        licenseOrCertification: { deleteMany: mockDeleteMany },
        otherSection: { deleteMany: mockDeleteMany },
        contactInfo: { deleteMany: mockDeleteMany },
        resumeSection: {
          findMany: jest.fn().mockResolvedValue([
            { summaryId: "sum-1" },
            { summaryId: null },
            { summaryId: "sum-2" },
          ]),
          deleteMany: mockDeleteMany,
        },
        summary: { deleteMany: mockDeleteMany },
        file: { deleteMany: mockDeleteMany },
        resume: { deleteMany: mockDeleteMany },
        activity: { deleteMany: mockDeleteMany },
        automation: { deleteMany: mockDeleteMany },
        crmTaskTarget: { deleteMany: mockDeleteMany },
        crmNoteTarget: { deleteMany: mockDeleteMany },
        contact: { deleteMany: mockDeleteMany },
        interview: { deleteMany: mockDeleteMany },
        user: { delete: mockDelete },
      };
      return fn(tx);
    });

    const result = await deleteAccount();
    expect(result.success).toBe(true);
  });

  it("returns success even if disk cleanup fails", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
    });
    const fsPromises = require("fs").promises;
    fsPromises.rm.mockRejectedValue(new Error("ENOENT"));
    fsPromises.unlink.mockRejectedValue(new Error("ENOENT"));

    const result = await deleteAccount();
    expect(result.success).toBe(true);
  });

  it("user.delete is the last operation in the transaction", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
    });

    const callOrder: string[] = [];
    mockTransaction.mockImplementationOnce(async (fn) => {
      const trackedDeleteMany = (label: string) =>
        jest.fn().mockImplementation(async () => {
          callOrder.push(label);
          return { count: 0 };
        });

      const tx = {
        workExperience: { deleteMany: trackedDeleteMany("workExperience") },
        education: { deleteMany: trackedDeleteMany("education") },
        licenseOrCertification: {
          deleteMany: trackedDeleteMany("licenseOrCertification"),
        },
        otherSection: { deleteMany: trackedDeleteMany("otherSection") },
        contactInfo: { deleteMany: trackedDeleteMany("contactInfo") },
        resumeSection: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: trackedDeleteMany("resumeSection"),
        },
        summary: { deleteMany: trackedDeleteMany("summary") },
        file: { deleteMany: trackedDeleteMany("file") },
        resume: { deleteMany: trackedDeleteMany("resume") },
        activity: { deleteMany: trackedDeleteMany("activity") },
        automation: { deleteMany: trackedDeleteMany("automation") },
        crmTaskTarget: { deleteMany: trackedDeleteMany("crmTaskTarget") },
        crmNoteTarget: { deleteMany: trackedDeleteMany("crmNoteTarget") },
        contact: { deleteMany: trackedDeleteMany("contact") },
        interview: { deleteMany: trackedDeleteMany("interview") },
        user: {
          delete: jest.fn().mockImplementation(async () => {
            callOrder.push("user.delete");
            return {};
          }),
        },
      };
      return fn(tx);
    });

    await deleteAccount();

    expect(callOrder[callOrder.length - 1]).toBe("user.delete");
  });
});
