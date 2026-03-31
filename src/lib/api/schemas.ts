import { z } from "zod";

/**
 * Zod validation schemas for Public API v1 endpoints.
 * Separate from internal form schemas — API surface is independently designed.
 */

/** Pagination query params */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

/** Filter/search query params for jobs list */
export const JobsListQuerySchema = PaginationSchema.extend({
  filter: z.string().optional(),
  search: z.string().optional(),
});

/** Create job request body */
export const CreateJobSchema = z.object({
  title: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company is required"),
  location: z.string().optional(),
  type: z.string().default("Full-time"),
  status: z.string().optional(),
  source: z.string().optional(),
  salaryRange: z.string().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  dateApplied: z.string().datetime().optional().nullable(),
  jobDescription: z.string().default(""),
  jobUrl: z.string().url().optional().nullable().or(z.literal("")),
  applied: z.boolean().default(false),
  resume: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

/** Partial update job request body */
export const UpdateJobSchema = CreateJobSchema.partial();

/** Create note request body */
export const CreateNoteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
});
