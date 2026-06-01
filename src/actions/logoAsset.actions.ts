"use server";

import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { getCurrentUser } from "@/utils/user.utils";
import { logoAssetService } from "@/lib/assets/logo-asset-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogoAssetInfo {
  id: string;
  status: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  errorMessage: string | null;
  sourceUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Get the LogoAsset for a given company (IDOR: userId from session).
 */
export async function getLogoAssetForCompany(
  companyId: string,
): Promise<ActionResult<LogoAssetInfo | null>> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("errors.notAuthenticated");

    const asset = await prisma.logoAsset.findFirst({
      where: {
        companyId,
        userId: user.id,
      },
      select: {
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
      },
    });

    return { success: true, data: asset ?? null };
  } catch (error) {
    return handleError(error, "errors.fetchFailed");
  }
}

/**
 * Delete a logo asset (file + DB record). Clears Company.logoAssetId.
 */
export async function deleteLogoAsset(
  logoAssetId: string,
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("errors.notAuthenticated");

    await logoAssetService.deleteAsset(logoAssetId, user.id);

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.deleteFailed");
  }
}

/**
 * Trigger a manual logo download for a company.
 * Reads the company's logoUrl and starts the download pipeline.
 */
export async function triggerLogoDownload(
  companyId: string,
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("errors.notAuthenticated");

    // Find the company (IDOR: createdBy check)
    const company = await prisma.company.findFirst({
      where: { id: companyId, createdBy: user.id },
      select: { id: true, logoUrl: true },
    });

    if (!company) {
      return { success: false, message: "errors.notFound" };
    }

    if (!company.logoUrl) {
      return { success: false, message: "logoAsset.noLogoUrl" };
    }

    // Fire-and-forget download
    logoAssetService
      .downloadAndProcess(company.logoUrl, user.id, companyId)
      .catch((error) => {
        console.error(
          "[triggerLogoDownload] Fire-and-forget download failed:",
          error,
        );
      });

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.unknown");
  }
}
