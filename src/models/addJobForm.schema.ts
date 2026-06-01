import { z } from "zod";

export const AddJobFormSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  title: z
    .string({
      error: "Job title is required.",
    })
    .min(2, {
      message: "Job title must be at least 2 characters.",
    })
    .max(255, {
      message: "Job title must be at most 255 characters.",
    }),
  company: z
    .string({
      error: "Company name is required.",
    })
    .min(2, {
      message: "Company name must be at least 2 characters.",
    })
    .max(255, {
      message: "Company name must be at most 255 characters.",
    }),
  location: z
    .string({
      error: "Location is required.",
    })
    .min(2, {
      message: "Location name must be at least 2 characters.",
    })
    .max(255, {
      message: "Location must be at most 255 characters.",
    }),
  type: z.string().min(1),
  source: z
    .string({
      error: "Source is required.",
    })
    .min(2, {
      message: "Source name must be at least 2 characters.",
    }),
  status: z
    .string({
      error: "Status is required.",
    })
    .min(2, {
      message: "Status must be at least 2 characters.",
    })
    .default("bookmarked"),
  dueDate: z.date().nullable().optional(),
  /**
   * Note: Timezone offsets can be allowed by setting the offset option to true.
   * z.string().datetime({ offset: true });
   */
  //
  dateApplied: z.date().optional(),
  // Structured salary (Welle 2 Phase 3). Fixum = min == max. All optional.
  salaryMin: z.number().nonnegative().nullable().optional(),
  salaryMax: z.number().nonnegative().nullable().optional(),
  salaryCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/i)
    .nullable()
    .optional(),
  salaryPeriod: z.enum(["yearly", "monthly", "hourly"]).nullable().optional(),
  salaryBonus: z
    .object({
      kind: z.enum(["fixed", "percentage", "mixed"]),
      amount: z.number().nonnegative().nullable().optional(),
      percentage: z.number().nonnegative().nullable().optional(),
      condition: z.string().max(200).nullable().optional(),
    })
    .nullable()
    .optional(),
  jobDescription: z
    .string({
      error: "Job description is required.",
    })
    .min(10, {
      message: "Job description must be at least 10 characters.",
    }),
  jobUrl: z.string().optional(),
  applied: z.boolean().default(false),
  resume: z.string().optional(),
  tags: z.array(z.string()).max(10).optional().default([]),
  sendToQueue: z.boolean().default(false),
});
