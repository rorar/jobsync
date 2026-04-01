"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { AddEducationFormSchema } from "@/models/AddEductionForm.schema";
import { AddContactInfoFormSchema } from "@/models/addContactInfoForm.schema";
import { AddExperienceFormSchema } from "@/models/addExperienceForm.schema";
import { AddSummarySectionFormSchema } from "@/models/addSummaryForm.schema";
import { CreateResumeFormSchema } from "@/models/createResumeForm.schema";
import { Resume, ResumeSection, SectionType, ContactInfo, WorkExperience, Education } from "@/models/profile.model";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";
import { APP_CONSTANTS } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { writeFile } from "fs/promises";

// Narrow Prisma string to domain enum
function toResumeSection<T extends { sectionType: string }>(
  row: T
): T & { sectionType: SectionType } {
  return {
    ...row,
    sectionType: row.sectionType as SectionType,
  };
}

export const getResumeList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE
): Promise<ActionResult<Resume[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.resume.findMany({
        where: {
          profile: {
            userId: user.id,
          },
        },
        skip,
        take: limit,
        select: {
          id: true,
          profileId: true,
          FileId: true,
          createdAt: true,
          updatedAt: true,
          title: true,
          _count: {
            select: {
              Job: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.resume.count({
        where: {
          profile: {
            userId: user.id,
          },
        },
      }),
    ]);
    return { data, total, success: true };
  } catch (error) {
    const msg = "Failed to get resume list.";
    return handleError(error, msg);
  }
};

export const getResumeById = async (
  resumeId: string
): Promise<ActionResult<Resume>> => {
  try {
    if (!resumeId) {
      throw new Error("Please provide resume id");
    }
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const resume = await prisma.resume.findFirst({
      where: {
        id: resumeId,
        profile: { userId: user.id },
      },
      include: {
        ContactInfo: true,
        File: { select: { id: true, fileName: true, fileType: true } },
        ResumeSections: {
          include: {
            summary: true,
            workExperiences: {
              include: {
                jobTitle: true,
                Company: true,
                location: true,
              },
            },
            educations: {
              include: {
                location: true,
              },
            },
          },
        },
      },
    });
    if (!resume) {
      return { data: undefined, success: true };
    }
    return {
      data: {
        ...resume,
        ContactInfo: resume.ContactInfo ?? undefined,
        File: resume.File ?? undefined,
        ResumeSections: resume.ResumeSections.map((section) => ({
          ...toResumeSection(section),
          summary: section.summary ?? undefined,
        })),
      },
      success: true,
    };
  } catch (error) {
    const msg = "Failed to get resume.";
    return handleError(error, msg);
  }
};

export const addContactInfo = async (
  data: z.infer<typeof AddContactInfoFormSchema>
): Promise<ActionResult<Resume>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership before mutation
    const owned = await prisma.resume.findFirst({
      where: { id: data.resumeId, profile: { userId: user.id } },
    });
    if (!owned) {
      throw new Error("Resume not found");
    }

    const res = await prisma.resume.update({
      where: {
        id: data.resumeId,
      },
      data: {
        ContactInfo: {
          connectOrCreate: {
            where: { resumeId: data.resumeId },
            create: {
              firstName: data.firstName,
              lastName: data.lastName,
              headline: data.headline,
              email: data.email!,
              phone: data.phone!,
              address: data.address,
            },
          },
        },
      },
    });
    revalidatePath("/dashboard/profile/resume");
    return { data: res, success: true };
  } catch (error) {
    const msg = "Failed to create contact info.";
    return handleError(error, msg);
  }
};

export const updateContactInfo = async (
  data: z.infer<typeof AddContactInfoFormSchema>
): Promise<ActionResult<ContactInfo>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership via contactInfo → resume → profile → userId
    const ownedContact = await prisma.contactInfo.findFirst({
      where: { id: data.id, resume: { profile: { userId: user.id } } },
    });
    if (!ownedContact) {
      throw new Error("Contact info not found");
    }

    const res = await prisma.contactInfo.update({
      where: {
        id: data.id,
      },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        headline: data.headline,
        email: data.email!,
        phone: data.phone!,
        address: data.address,
      },
    });
    revalidatePath("/dashboard/profile/resume");
    return { data: res, success: true };
  } catch (error) {
    const msg = "Failed to update contact info.";
    return handleError(error, msg);
  }
};

export const createResumeProfile = async (
  title: string,
  fileName: string,
  filePath?: string
): Promise<ActionResult<Resume>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    //check if title exists
    const value = title.trim().toLowerCase();

    const titleExists = await prisma.resume.findFirst({
      where: {
        title: value,
        profile: { userId: user.id },
      },
    });

    if (titleExists) {
      throw new Error("Title already exists!");
    }

    const profile = await prisma.profile.findFirst({
      where: {
        userId: user.id,
      },
    });

    let res;
    if (profile && profile.id) {
      res = await prisma.resume.create({
        data: {
          profileId: profile.id,
          title,
          FileId: fileName && filePath
            ? await createFileEntry(fileName, filePath as string)
            : null,
        },
      });
    } else {
      const newProfile = await prisma.profile.create({
        data: {
          userId: user.id,
          resumes: {
            create: [
              {
                title,
                FileId: fileName && filePath
                  ? await createFileEntry(fileName, filePath as string)
                  : null,
              },
            ],
          },
        },
        include: {
          resumes: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
      res = newProfile.resumes[0];
    }
    // revalidatePath("/dashboard/myjobs", "page");
    return { success: true, data: res };
  } catch (error) {
    const msg = "Failed to create resume.";
    return handleError(error, msg);
  }
};

const createFileEntry = async (
  fileName: string,
  filePath: string
) => {
  const newFileEntry = await prisma.file.create({
    data: {
      fileName,
      filePath,
      fileType: "resume",
    },
  });
  return newFileEntry.id;
};

export const editResume = async (
  id: string,
  title: string,
  fileId?: string,
  fileName?: string,
  filePath?: string
): Promise<ActionResult<Resume>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership before mutation
    const owned = await prisma.resume.findFirst({
      where: { id, profile: { userId: user.id } },
    });
    if (!owned) {
      throw new Error("Resume not found");
    }

    let resolvedFileId = fileId;

    if (!fileId && fileName && filePath) {
      resolvedFileId = await createFileEntry(fileName, filePath);
    }

    if (resolvedFileId) {
      const isValidFileId = await prisma.file.findFirst({
        where: { id: resolvedFileId },
      });

      if (!isValidFileId) {
        throw new Error(
          `The provided FileId "${resolvedFileId}" does not exist.`
        );
      }
    }

    const res = await prisma.resume.update({
      where: { id },
      data: {
        title,
        FileId: resolvedFileId || null,
      },
    });
    return { success: true, data: res };
  } catch (error) {
    const msg = "Failed to update resume or file.";
    return handleError(error, msg);
  }
};

export const deleteResumeById = async (
  resumeId: string,
  fileId?: string
): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }
    // Verify ownership before destructive operation
    const owned = await prisma.resume.findFirst({
      where: { id: resumeId, profile: { userId: user.id } },
    });
    if (!owned) {
      throw new Error("Resume not found");
    }

    if (fileId) {
      await deleteFile(fileId, user.id);
    }

    await prisma.$transaction(async (prisma) => {
      await prisma.contactInfo.deleteMany({
        where: {
          resumeId: resumeId,
        },
      });

      await prisma.summary.deleteMany({
        where: {
          ResumeSection: {
            resumeId: resumeId,
          },
        },
      });

      await prisma.workExperience.deleteMany({
        where: {
          ResumeSection: {
            resumeId: resumeId,
          },
        },
      });

      await prisma.education.deleteMany({
        where: {
          ResumeSection: {
            resumeId: resumeId,
          },
        },
      });

      await prisma.resumeSection.deleteMany({
        where: {
          resumeId: resumeId,
        },
      });

      await prisma.resume.delete({
        where: { id: resumeId },
      });
    });
    return { success: true };
  } catch (error) {
    const msg = "Failed to delete resume.";
    return handleError(error, msg);
  }
};

export const uploadFile = async (file: File, dir: string, filePath: string) => {
  // Validate path is within the expected directory to prevent path traversal
  const dataDir = path.resolve(process.env.NODE_ENV !== "production" ? "data" : "/data");
  const resolvedDir = path.resolve(dir);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedDir.startsWith(dataDir) || !resolvedPath.startsWith(resolvedDir)) {
    throw new Error("Invalid upload path");
  }

  const bytes = await file.arrayBuffer();
  const buffer = new Uint8Array(bytes);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await writeFile(filePath, buffer);
};

export const deleteFile = async (fileId: string, callerUserId?: string) => {
  try {
    // Verify ownership: File → Resume → Profile → User
    const whereClause = callerUserId
      ? { id: fileId, Resume: { profile: { userId: callerUserId } } }
      : { id: fileId };
    const file = await prisma.file.findFirst({
      where: whereClause,
    });

    const filePath = file?.filePath as string;

    const fullFilePath = path.join(filePath);
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }
    fs.unlinkSync(filePath);

    await prisma.file.delete({
      where: {
        id: fileId,
      },
    });

  } catch (error) {
    const msg = "Failed to delete file.";
    return handleError(error, msg);
  }
};

export const addResumeSummary = async (
  data: z.infer<typeof AddSummarySectionFormSchema>
): Promise<ActionResult<ResumeSection>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership of target resume
    const owned = await prisma.resume.findFirst({
      where: { id: data.resumeId!, profile: { userId: user.id } },
    });
    if (!owned) {
      throw new Error("Resume not found");
    }

    const res = await prisma.resumeSection.create({
      data: {
        resumeId: data.resumeId!,
        sectionTitle: data.sectionTitle!,
        sectionType: SectionType.SUMMARY,
      },
    });

    const summary = await prisma.resumeSection.update({
      where: {
        id: res.id,
      },
      data: {
        summary: {
          create: {
            content: data.content!,
          },
        },
      },
    });
    revalidatePath(`/dashboard/profile/resume/${data.resumeId}`);
    return { data: toResumeSection(summary), success: true };
  } catch (error) {
    const msg = "Failed to create summary.";
    return handleError(error, msg);
  }
};

export const updateResumeSummary = async (
  data: z.infer<typeof AddSummarySectionFormSchema>
): Promise<ActionResult<ResumeSection>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership via ResumeSection → Resume → profile → userId
    const ownedSection = await prisma.resumeSection.findFirst({
      where: { id: data.id, Resume: { profile: { userId: user.id } } },
    });
    if (!ownedSection) {
      throw new Error("Resume section not found");
    }

    const res = await prisma.resumeSection.update({
      where: {
        id: data.id,
      },
      data: {
        sectionTitle: data.sectionTitle!,
      },
    });

    const summary = await prisma.resumeSection.update({
      where: {
        id: data.id,
      },
      data: {
        summary: {
          update: {
            content: data.content!,
          },
        },
      },
    });
    revalidatePath(`/dashboard/profile/resume/${data.resumeId}`);
    return { data: toResumeSection(summary), success: true };
  } catch (error) {
    const msg = "Failed to update summary.";
    return handleError(error, msg);
  }
};

export const addExperience = async (
  data: z.infer<typeof AddExperienceFormSchema>
): Promise<ActionResult<ResumeSection>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership of target resume
    const owned = await prisma.resume.findFirst({
      where: { id: data.resumeId!, profile: { userId: user.id } },
    });
    if (!owned) {
      throw new Error("Resume not found");
    }

    if (!data.sectionId && !data.sectionTitle) {
      throw new Error("SectionTitle is required.");
    }

    // If sectionId provided, verify it belongs to the user's resume
    if (data.sectionId) {
      const ownedSection = await prisma.resumeSection.findFirst({
        where: { id: data.sectionId, Resume: { profile: { userId: user.id } } },
      });
      if (!ownedSection) {
        throw new Error("Resume section not found");
      }
    }

    const section = !data.sectionId
      ? await prisma.resumeSection.create({
          data: {
            resumeId: data.resumeId!,
            sectionTitle: data.sectionTitle!,
            sectionType: SectionType.EXPERIENCE,
          },
        })
      : undefined;

    const experience = await prisma.resumeSection.update({
      where: {
        id: section ? section.id : data.sectionId,
      },
      data: {
        workExperiences: {
          create: {
            jobTitleId: data.title,
            companyId: data.company,
            locationId: data.location,
            startDate: data.startDate,
            endDate: data.endDate,
            description: data.jobDescription,
          },
        },
      },
    });
    revalidatePath(`/dashboard/profile/resume/${data.resumeId}`);
    return { data: toResumeSection(experience), success: true };
  } catch (error) {
    const msg = "Failed to create experience.";
    return handleError(error, msg);
  }
};

export const updateExperience = async (
  data: z.infer<typeof AddExperienceFormSchema>
): Promise<ActionResult<WorkExperience>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership via WorkExperience → ResumeSection → Resume → profile → userId
    const ownedExp = await prisma.workExperience.findFirst({
      where: { id: data.id, ResumeSection: { Resume: { profile: { userId: user.id } } } },
    });
    if (!ownedExp) {
      throw new Error("Work experience not found");
    }

    const summary = await prisma.workExperience.update({
      where: {
        id: data.id,
      },
      data: {
        jobTitleId: data.title,
        companyId: data.company,
        locationId: data.location,
        startDate: data.startDate,
        endDate: data.endDate,
        description: data.jobDescription,
      },
    });
    revalidatePath(`/dashboard/profile/resume/${data.resumeId}`);
    return { data: summary, success: true };
  } catch (error) {
    const msg = "Failed to update experience.";
    return handleError(error, msg);
  }
};

export const addEducation = async (
  data: z.infer<typeof AddEducationFormSchema>
): Promise<ActionResult<ResumeSection>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership of target resume
    const owned = await prisma.resume.findFirst({
      where: { id: data.resumeId!, profile: { userId: user.id } },
    });
    if (!owned) {
      throw new Error("Resume not found");
    }

    // If sectionId provided, verify it belongs to the user's resume
    if (data.sectionId) {
      const ownedSection = await prisma.resumeSection.findFirst({
        where: { id: data.sectionId, Resume: { profile: { userId: user.id } } },
      });
      if (!ownedSection) {
        throw new Error("Resume section not found");
      }
    }

    const section = !data.sectionId
      ? await prisma.resumeSection.create({
          data: {
            resumeId: data.resumeId!,
            sectionTitle: data.sectionTitle!,
            sectionType: SectionType.EDUCATION,
          },
        })
      : undefined;

    const education = await prisma.resumeSection.update({
      where: {
        id: section ? section.id : data.sectionId,
      },
      data: {
        educations: {
          create: {
            institution: data.institution,
            degree: data.degree,
            fieldOfStudy: data.fieldOfStudy,
            locationId: data.location,
            startDate: data.startDate,
            endDate: data.endDate,
            description: data.description,
          },
        },
      },
    });
    revalidatePath(`/dashboard/profile/resume/${data.resumeId}`);
    return { data: toResumeSection(education), success: true };
  } catch (error) {
    const msg = "Failed to create education.";
    return handleError(error, msg);
  }
};

export const deleteWorkExperience = async (
  experienceId: string,
  resumeId: string
): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership via WorkExperience → ResumeSection → Resume → profile → userId
    const owned = await prisma.workExperience.findFirst({
      where: { id: experienceId, ResumeSection: { Resume: { profile: { userId: user.id } } } },
    });
    if (!owned) {
      throw new Error("Work experience not found");
    }

    await prisma.workExperience.delete({
      where: {
        id: experienceId,
      },
    });

    revalidatePath(`/dashboard/profile/resume/${resumeId}`);
    return { success: true };
  } catch (error) {
    const msg = "Failed to delete experience.";
    return handleError(error, msg);
  }
};

export const deleteEducation = async (
  educationId: string,
  resumeId: string
): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership via Education → ResumeSection → Resume → profile → userId
    const owned = await prisma.education.findFirst({
      where: { id: educationId, ResumeSection: { Resume: { profile: { userId: user.id } } } },
    });
    if (!owned) {
      throw new Error("Education not found");
    }

    await prisma.education.delete({
      where: {
        id: educationId,
      },
    });

    revalidatePath(`/dashboard/profile/resume/${resumeId}`);
    return { success: true };
  } catch (error) {
    const msg = "Failed to delete education.";
    return handleError(error, msg);
  }
};

export const updateEducation = async (
  data: z.infer<typeof AddEducationFormSchema>
): Promise<ActionResult<Education>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify ownership via Education → ResumeSection → Resume → profile → userId
    const ownedEdu = await prisma.education.findFirst({
      where: { id: data.id, ResumeSection: { Resume: { profile: { userId: user.id } } } },
    });
    if (!ownedEdu) {
      throw new Error("Education not found");
    }

    const summary = await prisma.education.update({
      where: {
        id: data.id,
      },
      data: {
        institution: data.institution,
        degree: data.degree,
        fieldOfStudy: data.fieldOfStudy,
        locationId: data.location,
        startDate: data.startDate,
        endDate: data.endDate,
        description: data.description,
      },
    });
    revalidatePath(`/dashboard/profile/resume/${data.resumeId}`);
    return { data: summary, success: true };
  } catch (error) {
    const msg = "Failed to update education.";
    return handleError(error, msg);
  }
};
