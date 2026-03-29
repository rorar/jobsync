import { z } from "zod";

export const JobBoardSchema = z.string().min(1);

export const AutomationStatusSchema = z.enum(["active", "paused"]);

export const AutomationRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "completed_with_errors",
  "blocked",
  "rate_limited",
]);

export const DiscoveryStatusSchema = z.enum(["new", "accepted", "dismissed"]);

export const CreateAutomationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  jobBoard: JobBoardSchema,
  keywords: z.string().min(1, "Keywords are required").max(500),
  location: z.string().min(1, "Location is required").max(200),
  connectorParams: z.string().max(10000).optional(),
  resumeId: z.string().uuid("Invalid resume"),
  matchThreshold: z.number().min(0).max(100),
  scheduleHour: z.number().min(0).max(23),
  scheduleFrequency: z.enum(["6h", "12h", "daily", "2d", "weekly"]).default("daily"),
});

export const UpdateAutomationSchema = CreateAutomationSchema.partial();

export type CreateAutomationInput = z.input<typeof CreateAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof UpdateAutomationSchema>;
