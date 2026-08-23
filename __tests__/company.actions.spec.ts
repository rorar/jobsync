import {
  addCompany,
  deleteCompanyById,
  findOrCreateCompany,
  getAllCompanies,
  getCompanyById,
  getCompanyList,
  updateCompany,
} from "@/actions/company.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { revalidatePath } from "next/cache";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Mock the Prisma Client
jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    company: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    workExperience: {
      count: jest.fn(),
    },
    job: {
      count: jest.fn(),
    },
    crmNote: {
      deleteMany: jest.fn(),
    },
    crmTask: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
    logoAsset: {
      findFirst: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

describe("Company Actions", () => {
  const mockUser = { id: "user-id" };

  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe("getCompanyList", () => {
    it("should return company list for authenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const mockData = [
        {
          id: "company-id",
          label: "Company 1",
          value: "company1",
          logoUrl: "logo.png",
        },
      ];
      const mockTotal = 1;

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockData);
      (prisma.company.count as jest.Mock).mockResolvedValue(mockTotal);

      const result = await getCompanyList(1, 10);

      expect(result).toEqual({ success: true, data: mockData, total: mockTotal });
      expect(prisma.company.findMany).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
        skip: 0,
        take: 10,
        orderBy: { jobsApplied: { _count: "desc" } },
      });
      expect(prisma.company.count).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
      });
    });

    it("should throw an error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      await expect(getCompanyList(1, 10)).resolves.toStrictEqual({
        success: false,
        message: "errors.fetchFailed",
      });

      expect(prisma.company.findMany).not.toHaveBeenCalled();
      expect(prisma.company.count).not.toHaveBeenCalled();
    });

    it("should filter by status when countBy is provided", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const mockData = [
        {
          id: "company-id",
          label: "Company 1",
          value: "company1",
          logoUrl: "logo.png",
        },
      ];
      const mockTotal = 1;

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockData);
      (prisma.company.count as jest.Mock).mockResolvedValue(mockTotal);

      const result = await getCompanyList(1, 10, "applied");

      expect(result).toEqual({ success: true, data: mockData, total: mockTotal });
      expect(prisma.company.findMany).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
        skip: 0,
        take: 10,
        select: {
          id: true,
          label: true,
          value: true,
          logoUrl: true,
          logoAssetId: true,
          createdBy: true,
          _count: {
            select: {
              jobsApplied: {
                where: {
                  applied: true,
                },
              },
            },
          },
        },
        orderBy: { jobsApplied: { _count: "desc" } },
      });
      expect(prisma.company.count).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
      });
    });

    it("should handle errors", async () => {
      (getCurrentUser as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );

      await expect(getCompanyList(1, 10)).resolves.toStrictEqual({
        success: false,
        message: "errors.fetchFailed",
      });

      expect(prisma.company.findMany).not.toHaveBeenCalled();
      expect(prisma.company.count).not.toHaveBeenCalled();
    });
  });

  describe("getAllCompanies", () => {
    it("should return all companies for authenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const mockCompanies = [
        { id: "company1", name: "Company 1" },
        { id: "company2", name: "Company 2" },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCompanies);

      const result = await getAllCompanies();

      expect(result).toEqual({ success: true, data: mockCompanies });
      expect(prisma.company.findMany).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
      });
    });

    it("should throw an error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      await expect(getAllCompanies()).resolves.toStrictEqual({
        success: false,
        message: "errors.fetchFailed",
      });

      expect(prisma.company.findMany).not.toHaveBeenCalled();
    });

    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findMany as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const result = await getAllCompanies();

      expect(result).toEqual({ success: false, message: "errors.fetchFailed" });
      expect(prisma.company.findMany).toHaveBeenCalledWith({
        where: { createdBy: mockUser.id },
      });
    });
  });

  describe("addCompany", () => {
    const validData = {
      company: "New Company",
      logoUrl: "http://example.com/logo.png",
    };

    it("should create a new company successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockResolvedValue(null);
      const mockCompany = {
        id: "company-id",
        label: "New Company",
        value: "new company",
        logoUrl: "http://example.com/logo.png",
        createdBy: mockUser.id,
      };
      (prisma.company.create as jest.Mock).mockResolvedValue(mockCompany);
      // Mock revalidatePath to prevent any errors during the test
      (revalidatePath as jest.Mock).mockResolvedValue(undefined);

      const result = await addCompany(validData);

      expect(result).toEqual({ success: true, data: mockCompany });
      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { value: "new company", createdBy: mockUser.id },
      });
      expect(prisma.company.create).toHaveBeenCalledWith({
        data: {
          createdBy: mockUser.id,
          value: "new company",
          label: "New Company",
          logoUrl: "http://example.com/logo.png",
        },
      });
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/myjobs", "page");
    });

    it("should return an error if the user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await addCompany(validData);

      expect(result).toEqual({ success: false, message: "errors.createFailed" });
      expect(prisma.company.findFirst).not.toHaveBeenCalled();
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it("should return an error if the company already exists", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const mockExistingCompany = {
        id: "existing-company-id",
        ...validData,
        value: "new company",
        createdBy: mockUser.id,
      };
      (prisma.company.findFirst as jest.Mock).mockResolvedValue(
        mockExistingCompany,
      );

      const result = await addCompany(validData);

      expect(result).toEqual({
        success: false,
        message: "errors.createFailed",
      });
      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { value: "new company", createdBy: mockUser.id },
      });
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const result = await addCompany(validData);

      expect(result).toEqual({ success: false, message: "errors.createFailed" });
      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { value: "new company", createdBy: mockUser.id },
      });
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it("should return error if logo URL is invalid", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const invalidData = {
        company: "New Company",
        logoUrl: "javascript:alert('xss')",
      };

      const result = await addCompany(invalidData);

      expect(result).toEqual({
        success: false,
        message: "errors.createFailed",
      });

      expect(prisma.company.findFirst).not.toHaveBeenCalled();
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it("should return error if logo URL has data protocol", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const invalidData = {
        company: "New Company",
        logoUrl: "data:image/png;base64,iVBORw0KGgo=",
      };

      const result = await addCompany(invalidData);

      expect(result).toEqual({
        success: false,
        message: "errors.createFailed",
      });

      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it("should allow empty logo URL", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockResolvedValue(null);
      const mockCompany = {
        id: "company-id",
        label: "New Company",
        value: "new company",
        logoUrl: "",
        createdBy: mockUser.id,
      };
      (prisma.company.create as jest.Mock).mockResolvedValue(mockCompany);
      (revalidatePath as jest.Mock).mockResolvedValue(undefined);

      const result = await addCompany({
        company: "New Company",
        logoUrl: "",
      });

      expect(result).toEqual({ success: true, data: mockCompany });
      expect(prisma.company.create).toHaveBeenCalled();
    });

    it("should allow https URLs", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockResolvedValue(null);
      const mockCompany = {
        id: "company-id",
        label: "New Company",
        value: "new company",
        logoUrl: "https://example.com/logo.png",
        createdBy: mockUser.id,
      };
      (prisma.company.create as jest.Mock).mockResolvedValue(mockCompany);
      (revalidatePath as jest.Mock).mockResolvedValue(undefined);

      const result = await addCompany({
        company: "New Company",
        logoUrl: "https://example.com/logo.png",
      });

      expect(result).toEqual({ success: true, data: mockCompany });
      expect(prisma.company.create).toHaveBeenCalled();
    });
  });

  describe("updateCompany", () => {
    const validData = {
      id: "company-id",
      company: "Updated Company",
      logoUrl: "http://example.com/logo.png",
      createdBy: "user-id",
    };

    it("should update a company successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      (prisma.company.findFirst as jest.Mock).mockResolvedValue(null);

      const mockUpdatedCompany = {
        id: "company-id",
        value: "updated company",
      };

      (prisma.company.update as jest.Mock).mockResolvedValue(
        mockUpdatedCompany,
      );

      const result = await updateCompany(validData);

      expect(result).toEqual({ success: true, data: mockUpdatedCompany });

      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { value: "updated company", createdBy: mockUser.id },
      });

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: "company-id", createdBy: mockUser.id },
        data: {
          value: "updated company",
          label: "Updated Company",
          logoUrl: "http://example.com/logo.png",
        },
      });
    });

    it("should return error if user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await updateCompany(validData);

      expect(result).toEqual({ success: false, message: "errors.updateFailed" });

      expect(prisma.company.findFirst).not.toHaveBeenCalled();
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("should return error if company already exists", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      (prisma.company.findFirst as jest.Mock).mockResolvedValue({
        id: "existing-company-id",
      });

      const result = await updateCompany(validData);

      expect(result).toEqual({
        success: false,
        message: "errors.updateFailed",
      });

      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("should return error if id is not provided or no user privileges", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const invalidData = { ...validData, id: "", createdBy: "other-user-id" };

      const result = await updateCompany(invalidData);

      expect(result).toEqual({
        success: false,
        message: "errors.updateFailed",
      });

      expect(prisma.company.findFirst).not.toHaveBeenCalled();
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("should return error if logo URL is invalid", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const invalidData = {
        ...validData,
        logoUrl: "javascript:alert('xss')",
      };

      const result = await updateCompany(invalidData);

      expect(result).toEqual({
        success: false,
        message: "errors.updateFailed",
      });

      expect(prisma.company.findFirst).not.toHaveBeenCalled();
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("should return error if logo URL has data protocol", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const invalidData = {
        ...validData,
        logoUrl: "data:image/png;base64,iVBORw0KGgo=",
      };

      const result = await updateCompany(invalidData);

      expect(result).toEqual({
        success: false,
        message: "errors.updateFailed",
      });

      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it("should allow empty logo URL", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      (prisma.company.findFirst as jest.Mock).mockResolvedValue(null);

      const mockUpdatedCompany = {
        id: "company-id",
        value: "updated company",
      };

      (prisma.company.update as jest.Mock).mockResolvedValue(
        mockUpdatedCompany,
      );

      const result = await updateCompany({
        ...validData,
        logoUrl: "",
      });

      expect(result).toEqual({ success: true, data: mockUpdatedCompany });
      expect(prisma.company.update).toHaveBeenCalled();
    });
  });

  describe("getCompanyById", () => {
    const mockCompanyId = "company-id";
    const mockCompany = {
      id: "company-id",
      label: "Test Company",
      value: "test-company",
      createdBy: "user-id",
      logoUrl: "http://example.com/logo.png",
    };

    it("should fetch company by id successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      (prisma.company.findFirst as jest.Mock).mockResolvedValue(mockCompany);

      const result = await getCompanyById(mockCompanyId);

      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { id: mockCompanyId, createdBy: mockUser.id },
      });

      expect(result).toEqual({ success: true, data: mockCompany });
    });

    it("should return invalidInput error when companyId is not provided", async () => {
      await expect(getCompanyById("")).resolves.toStrictEqual({
        success: false,
        message: "errors.invalidInput",
      });

      expect(prisma.company.findFirst).not.toHaveBeenCalled();
    });

    it("should throw error when user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      await expect(getCompanyById(mockCompanyId)).resolves.toStrictEqual({
        success: false,
        message: "errors.notAuthenticated",
      });

      expect(prisma.company.findFirst).not.toHaveBeenCalled();
    });

    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(getCompanyById(mockCompanyId)).resolves.toStrictEqual({
        success: false,
        message: "errors.fetchFailed",
      });

      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { id: mockCompanyId, createdBy: mockUser.id },
      });
    });
  });

  describe("deleteCompanyById", () => {
    // W-D3: deleting the Company cascades away its CrmNoteTarget rows, so a note
    // that ONLY targeted it is left unreachable. Delete + prune run as one
    // transaction, prune last. Tasks are not pruned (still visible on the board).
    beforeEach(() => {
      (prisma.crmNote.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.crmTask.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (ops: unknown) => Promise.all(ops as Promise<unknown>[]),
      );
    });

    it("should delete a company successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.workExperience.count as jest.Mock).mockResolvedValue(0);
      (prisma.job.count as jest.Mock).mockResolvedValue(0);
      (prisma.logoAsset.findFirst as jest.Mock).mockResolvedValue(null);
      const mockDeleted = { id: "company-id", label: "Test Company" };
      (prisma.company.delete as jest.Mock).mockResolvedValue(mockDeleted);

      const result = await deleteCompanyById("company-id");

      expect(result).toEqual({ data: mockDeleted, success: true });
      expect(prisma.company.delete).toHaveBeenCalledWith({
        where: { id: "company-id", createdBy: mockUser.id },
      });
    });

    it("prunes notes orphaned by the cascade, in one transaction (W-D3)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.workExperience.count as jest.Mock).mockResolvedValue(0);
      (prisma.job.count as jest.Mock).mockResolvedValue(0);
      (prisma.logoAsset.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.company.delete as jest.Mock).mockResolvedValue({ id: "company-id" });

      await deleteCompanyById("company-id");

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(Array.isArray(ops)).toBe(true);
      expect(ops).toHaveLength(2);

      expect(prisma.crmNote.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, targets: { none: {} } },
      });
      expect(prisma.crmTask.deleteMany).not.toHaveBeenCalled();
      // The prune must be the LAST op in the array.
      expect(ops[ops.length - 1]).toBe(
        (prisma.crmNote.deleteMany as jest.Mock).mock.results[0].value,
      );
    });

    it("should return error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await deleteCompanyById("company-id");

      expect(result).toEqual({ success: false, message: "errors.deleteFailed" });
      expect(prisma.company.delete).not.toHaveBeenCalled();
    });

    it("should prevent deletion when work experiences exist", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.workExperience.count as jest.Mock).mockResolvedValue(1);

      const result = await deleteCompanyById("company-id");

      expect(result).toEqual({
        success: false,
        message: "errors.deleteFailed",
      });
      expect(prisma.job.count).not.toHaveBeenCalled();
      expect(prisma.company.delete).not.toHaveBeenCalled();
    });

    it("should prevent deletion when associated jobs exist", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.workExperience.count as jest.Mock).mockResolvedValue(0);
      (prisma.job.count as jest.Mock).mockResolvedValue(3);

      const result = await deleteCompanyById("company-id");

      expect(result).toEqual({
        success: false,
        message: "errors.deleteFailed",
      });
      expect(prisma.company.delete).not.toHaveBeenCalled();
    });

    it("should handle unexpected errors", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.workExperience.count as jest.Mock).mockResolvedValue(0);
      (prisma.job.count as jest.Mock).mockResolvedValue(0);
      (prisma.company.delete as jest.Mock).mockRejectedValue(
        new Error("Delete failed"),
      );

      const result = await deleteCompanyById("company-id");

      expect(result).toEqual({ success: false, message: "errors.deleteFailed" });
    });
  });

  /**
   * findOrCreateCompany — the picker-facing resolve-or-create path.
   *
   * Differs from addCompany deliberately: an existing company is RETURNED, not
   * treated as an error. addCompany throws on a duplicate, which is a dead end
   * for an inline-create flow where the user's intent ("link this contact to
   * this company") is satisfiable by the existing row.
   * See .full-stack-feature/03-architecture.md §1.1.
   */
  describe("findOrCreateCompany", () => {
    const existingCompany = {
      id: "existing-company-id",
      label: "Acme",
      value: "acme",
      logoUrl: null,
      createdBy: "user-id",
    };

    it("should return the existing company instead of erroring on a duplicate", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockResolvedValue(existingCompany);

      const result = await findOrCreateCompany("Acme");

      expect(result).toEqual({ success: true, data: existingCompany });
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it("should match case-insensitively and ignore surrounding whitespace", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockResolvedValue(existingCompany);

      const result = await findOrCreateCompany("  ACME  ");

      expect(result).toEqual({ success: true, data: existingCompany });
      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { value: "acme", createdBy: mockUser.id },
      });
    });

    it("should create the company when none matches, preserving the typed casing as label", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockResolvedValue(null);
      const created = {
        id: "new-company-id",
        label: "Beispiel GmbH",
        value: "beispiel gmbh",
        logoUrl: null,
        createdBy: mockUser.id,
      };
      (prisma.company.create as jest.Mock).mockResolvedValue(created);

      const result = await findOrCreateCompany("  Beispiel GmbH  ");

      expect(result).toEqual({ success: true, data: created });
      expect(prisma.company.create).toHaveBeenCalledWith({
        data: {
          createdBy: mockUser.id,
          value: "beispiel gmbh",
          label: "Beispiel GmbH",
        },
      });
    });

    it("should scope both the lookup and the create to the session user (ADR-015)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.company.create as jest.Mock).mockResolvedValue({
        id: "new-company-id",
        label: "Scoped",
        value: "scoped",
        createdBy: mockUser.id,
      });

      await findOrCreateCompany("Scoped");

      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { value: "scoped", createdBy: mockUser.id },
      });
      expect(prisma.company.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdBy: mockUser.id }),
        }),
      );
    });

    it("should reject an empty or whitespace-only name with a translated key", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const result = await findOrCreateCompany("   ");

      expect(result).toEqual({
        success: false,
        message: "crm.errors.companyNameRequired",
      });
      expect(prisma.company.findFirst).not.toHaveBeenCalled();
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it("should return an error if the user is not authenticated", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await findOrCreateCompany("Acme");

      expect(result.success).toBe(false);
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it("should handle unexpected errors with the generic create key", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.company.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.company.create as jest.Mock).mockRejectedValue(
        new Error("db down"),
      );

      const result = await findOrCreateCompany("Acme");

      expect(result).toEqual({ success: false, message: "errors.createFailed" });
    });
  });
});
