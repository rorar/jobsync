import { z } from "zod";

/**
 * Zod validation schemas for Public API v1 endpoints.
 * Separate from internal form schemas — API surface is independently designed.
 * All string fields have max length limits to prevent payload abuse.
 */

/** Pagination query params */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

/** Filter/search query params for jobs list */
export const JobsListQuerySchema = PaginationSchema.extend({
  filter: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
});

/** Create job request body */
export const CreateJobSchema = z.object({
  title: z.string().min(1, "Job title is required").max(500),
  company: z.string().min(1, "Company is required").max(500),
  location: z.string().max(500).optional(),
  type: z.string().max(100).default("Full-time"),
  status: z.string().max(100).optional(),
  source: z.string().max(200).optional(),
  salaryRange: z.string().max(200).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  dateApplied: z.string().datetime().optional().nullable(),
  jobDescription: z.string().max(50_000).default(""),
  jobUrl: z.string().max(2000).url().optional().nullable().or(z.literal("")),
  applied: z.boolean().default(false),
  resume: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().uuid()).max(50).optional(),
});

/** Partial update job request body */
export const UpdateJobSchema = CreateJobSchema.partial();

/** Create note request body */
export const CreateNoteSchema = z.object({
  content: z.string().min(1, "Note content is required").max(10_000),
});
