/**
 * logoAsset.actions Tests
 *
 * Tests: getLogoAssetForCompany, deleteLogoAsset, triggerLogoDownload.
 * Security: IDOR protection — userId always from session, never client.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockLogoAssetFindFirst = jest.fn();
const mockCompanyFindFirst = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    logoAsset: {
      findFirst: (...args: unknown[]) => mockLogoAssetFindFirst(...args),
    },
    company: {
      findFirst: (...args: unknown[]) => mockCompanyFindFirst(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// getCurrentUser mock
// ---------------------------------------------------------------------------

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

// ---------------------------------------------------------------------------
// logoAssetService mock
// ---------------------------------------------------------------------------

const mockDeleteAsset = jest.fn();
const mockDownloadAndProcess = jest.fn();

jest.mock("@/lib/assets/logo-asset-service", () => ({
  logoAssetService: {
    deleteAsset: (...args: unknown[]) => mockDeleteAsset(...args),
    downloadAndProcess: (...args: unknown[]) => mockDownloadAndProcess(...args),
  },
}));

// ---------------------------------------------------------------------------
// next/cache mock (required by some action dependencies)
// ---------------------------------------------------------------------------

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { getCurrentUser } from "@/utils/user.utils";
import {
  getLogoAssetForCompany,
  deleteLogoAsset,
  triggerLogoDownload,
} from "@/actions/logoAsset.actions";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockUser = { id: "user-abc-123", name: "Test User", email: "test@example.com" };

const mockAsset = {
  id: "logo-asset-fixture-id",
  status: "ready",
  mimeType: "image/png",
  fileSize: 24576,
  width: 256,
  height: 256,
  errorMessage: null,
  sourceUrl: "https://img.logo.dev/acme.com",
  createdAt: new Date("2026-04-06T10:00:00.000Z"),
  updatedAt: new Date("2026-04-06T10:00:00.000Z"),
};

const mockCompany = {
  id: "company-fixture-id",
  logoUrl: "https://img.logo.dev/acme.com",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("logoAsset.actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  // -------------------------------------------------------------------------
  // getLogoAssetForCompany
  // -------------------------------------------------------------------------

  describe("getLogoAssetForCompany", () => {
    it("returns asset data for an authenticated user with an existing asset", async () => {
      mockLogoAssetFindFirst.mockResolvedValue(mockAsset);

      const result = await getLogoAssetForCompany("company-fixture-id");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAsset);
    });

    it("queries with userId from session (IDOR protection)", async () => {
      mockLogoAssetFindFirst.mockResolvedValue(mockAsset);

      await getLogoAssetForCompany("company-fixture-id");

      expect(mockLogoAssetFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: "company-fixture-id",
            userId: mockUser.id,
          }),
        }),
      );
    });

    it("returns null when no asset exists for the company", async () => {
      mockLogoAssetFindFirst.mockResolvedValue(null);

      const result = await getLogoAssetForCompany("non-existent-company");

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getLogoAssetForCompany("company-fixture-id");

      expect(result.success).toBe(false);
      expect(mockLogoAssetFindFirst).not.toHaveBeenCalled();
    });

    it("selects only the expected fields (no filePath in response)", async () => {
      mockLogoAssetFindFirst.mockResolvedValue(mockAsset);

      await getLogoAssetForCompany("company-fixture-id");

      expect(mockLogoAssetFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            status: true,
            mimeType: true,
            fileSize: true,
            width: true,
            height: true,
            errorMessage: true,
            sourceUrl: true,
            createdAt: true,
            updatedAt: true,
          }),
        }),
      );

      // filePath must NOT be selected (security: never expose server paths to client)
      const selectArg = mockLogoAssetFindFirst.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty("filePath");
    });

    it("returns error when Prisma throws", async () => {
      mockLogoAssetFindFirst.mockRejectedValue(new Error("DB connection failed"));

      const result = await getLogoAssetForCompany("company-fixture-id");

      expect(result.success).toBe(false);
    });

    it("returns the pending status asset correctly", async () => {
      const pendingAsset = {
        ...mockAsset,
        id: "logo-asset-pending-id",
        status: "pending",
        fileSize: 0,
        width: null,
        height: null,
      };
      mockLogoAssetFindFirst.mockResolvedValue(pendingAsset);

      const result = await getLogoAssetForCompany("company-fixture-id");

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("pending");
      expect(result.data?.width).toBeNull();
    });

    it("returns the failed status asset with errorMessage", async () => {
      const failedAsset = {
        ...mockAsset,
        id: "logo-asset-failed-id",
        status: "failed",
        fileSize: 0,
        width: null,
        height: null,
        errorMessage: "Download failed: 404 Not Found",
      };
      mockLogoAssetFindFirst.mockResolvedValue(failedAsset);

      const result = await getLogoAssetForCompany("company-fixture-id");

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("failed");
      expect(result.data?.errorMessage).toBe("Download failed: 404 Not Found");
    });
  });

  // -------------------------------------------------------------------------
  // deleteLogoAsset
  // -------------------------------------------------------------------------

  describe("deleteLogoAsset", () => {
    it("deletes a logo asset owned by the authenticated user", async () => {
      mockDeleteAsset.mockResolvedValue(undefined);

      const result = await deleteLogoAsset("logo-asset-fixture-id");

      expect(result.success).toBe(true);
      expect(mockDeleteAsset).toHaveBeenCalledWith(
        "logo-asset-fixture-id",
        mockUser.id,
      );
    });

    it("passes userId from session to the service (IDOR protection)", async () => {
      mockDeleteAsset.mockResolvedValue(undefined);

      await deleteLogoAsset("logo-asset-fixture-id");

      // The service receives userId from the session, not from client input
      const [, calledUserId] = mockDeleteAsset.mock.calls[0];
      expect(calledUserId).toBe(mockUser.id);
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await deleteLogoAsset("logo-asset-fixture-id");

      expect(result.success).toBe(false);
      expect(mockDeleteAsset).not.toHaveBeenCalled();
    });

    it("IDOR: does not delete assets owned by another user", async () => {
      // The service enforces ownership via userId — simulate it finding nothing
      // (service's deleteAsset returns early when userId doesn't match)
      mockDeleteAsset.mockResolvedValue(undefined);

      const otherUsersAssetId = "other-user-logo-asset-id";
      const result = await deleteLogoAsset(otherUsersAssetId);

      // Action itself succeeds (service handles IDOR internally)
      expect(result.success).toBe(true);
      // But the service was called with the session user's ID, not an attacker-injected one
      expect(mockDeleteAsset).toHaveBeenCalledWith(
        otherUsersAssetId,
        mockUser.id, // always the session user, never client-supplied
      );
    });

    it("returns error when service throws", async () => {
      mockDeleteAsset.mockRejectedValue(new Error("File system error"));

      const result = await deleteLogoAsset("logo-asset-fixture-id");

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // triggerLogoDownload
  // -------------------------------------------------------------------------

  describe("triggerLogoDownload", () => {
    it("triggers a logo download for a company with a logoUrl", async () => {
      mockCompanyFindFirst.mockResolvedValue(mockCompany);
      // fire-and-forget: downloadAndProcess returns a promise that resolves
      mockDownloadAndProcess.mockResolvedValue(undefined);

      const result = await triggerLogoDownload("company-fixture-id");

      expect(result.success).toBe(true);
    });

    it("queries company with userId from session (IDOR protection)", async () => {
      mockCompanyFindFirst.mockResolvedValue(mockCompany);
      mockDownloadAndProcess.mockResolvedValue(undefined);

      await triggerLogoDownload("company-fixture-id");

      expect(mockCompanyFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "company-fixture-id",
            createdBy: mockUser.id,
          }),
        }),
      );
    });

    it("returns error when company is not found (IDOR: company belongs to another user)", async () => {
      mockCompanyFindFirst.mockResolvedValue(null);

      const result = await triggerLogoDownload("other-user-company-id");

      expect(result.success).toBe(false);
      expect(result.message).toBe("Company not found.");
      expect(mockDownloadAndProcess).not.toHaveBeenCalled();
    });

    it("returns error when company has no logoUrl", async () => {
      mockCompanyFindFirst.mockResolvedValue({ id: "company-fixture-id", logoUrl: null });

      const result = await triggerLogoDownload("company-fixture-id");

      expect(result.success).toBe(false);
      expect(result.message).toBe("Company has no logo URL.");
      expect(mockDownloadAndProcess).not.toHaveBeenCalled();
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await triggerLogoDownload("company-fixture-id");

      expect(result.success).toBe(false);
      expect(mockCompanyFindFirst).not.toHaveBeenCalled();
      expect(mockDownloadAndProcess).not.toHaveBeenCalled();
    });

    it("calls downloadAndProcess with correct arguments (fire-and-forget)", async () => {
      mockCompanyFindFirst.mockResolvedValue(mockCompany);
      mockDownloadAndProcess.mockResolvedValue(undefined);

      await triggerLogoDownload("company-fixture-id");

      expect(mockDownloadAndProcess).toHaveBeenCalledWith(
        mockCompany.logoUrl,
        mockUser.id,
        "company-fixture-id",
      );
    });

    it("returns success even when downloadAndProcess is fire-and-forget", async () => {
      mockCompanyFindFirst.mockResolvedValue(mockCompany);
      // Simulate a rejection in the background — action still returns success
      mockDownloadAndProcess.mockRejectedValue(new Error("network error"));

      const result = await triggerLogoDownload("company-fixture-id");

      // triggerLogoDownload returns success immediately — it doesn't await the download
      expect(result.success).toBe(true);
    });

    it("returns error when the initial Prisma query throws", async () => {
      mockCompanyFindFirst.mockRejectedValue(new Error("DB error"));

      const result = await triggerLogoDownload("company-fixture-id");

      expect(result.success).toBe(false);
    });

    it("returns empty logoUrl company gracefully", async () => {
      mockCompanyFindFirst.mockResolvedValue({ id: "company-fixture-id", logoUrl: "" });

      const result = await triggerLogoDownload("company-fixture-id");

      // Empty string is falsy — treated as missing logoUrl
      expect(result.success).toBe(false);
      expect(result.message).toBe("Company has no logo URL.");
    });
  });
});
