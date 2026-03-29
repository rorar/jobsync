"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ContactInfo } from "@/models/profile.model";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";

/**
 * Returns the most recently updated ContactInfo across all of the
 * current user's resumes (excluding a given resume).
 * Used to pre-fill the Contact Info form when creating a new resume.
 */
export const getLatestContactInfo = async (
  excludeResumeId?: string
): Promise<ActionResult<ContactInfo>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const contactInfo = await prisma.contactInfo.findFirst({
      where: {
        resume: {
          profile: {
            userId: user.id,
          },
        },
        ...(excludeResumeId ? { resumeId: { not: excludeResumeId } } : {}),
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return {
      success: true,
      data: contactInfo ?? undefined,
    };
  } catch (error) {
    const msg = "Failed to get latest contact info.";
    return handleError(error, msg);
  }
};
