// Automation types and interfaces

import type { RunSource } from "@/lib/scheduler/types";
export type { RunSource };
export type AutomationStatus = "active" | "paused";
export type AutomationPauseReason =
  | "module_deactivated"
  | "auth_failure"
  | "consecutive_failures"
  | "cb_escalation";
export type AutomationRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "completed_with_errors"
  | "blocked"
  | "rate_limited";
export type DiscoveryStatus = "new" | "accepted" | "dismissed";
export type JobBoard = string;

export interface Automation {
  id: string;
  userId: string;
  name: string;
  jobBoard: JobBoard;
  keywords: string;
  location: string;
  connectorParams: string | null;
  resumeId: string;
  matchThreshold: number;
  scheduleHour: number;
  scheduleFrequency: string;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  status: AutomationStatus;
  pauseReason: AutomationPauseReason | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationWithResume extends Automation {
  resume: {
    id: string;
    title: string;
  };
}

export interface AutomationRun {
  id: string;
  automationId: string;
  jobsSearched: number;
  jobsDeduplicated: number;
  jobsProcessed: number;
  jobsMatched: number;
  jobsSaved: number;
  status: AutomationRunStatus;
  errorMessage: string | null;
  blockedReason: string | null;
  startedAt: Date;
  completedAt: Date | null;
  runSource: RunSource;
}

/**
 * DiscoveredJob represents a staged vacancy surfaced by an automation run.
 *
 * The original DiscoveredJob Prisma model (with JobTitle/Company/Location
 * relations) was replaced by StagedVacancy in the vacancy-pipeline migration.
 * This interface is a union shape that accepts both the old relational fields
 * and the new StagedVacancy flat fields. At runtime, data comes from
 * StagedVacancy — the flat fields (title, employerName, location, sourceUrl,
 * status) are always present; the old relation fields are absent.
 *
 * Components should use the StagedVacancy field names (title, employerName,
 * location, sourceUrl, status). The old fields are kept as optional deprecated
 * properties for backward compatibility during migration.
 */
export interface DiscoveredJob {
  id: string;
  userId: string;
  automationId: string | null;
  automation?: { id: string; name: string } | null;

  // --- StagedVacancy fields (present at runtime) ---
  sourceBoard?: string;
  externalId?: string | null;
  sourceUrl?: string | null;
  title?: string;
  employerName?: string | null;
  location?: string | null;
  description?: string | null;
  salary?: string | null;
  employmentType?: string | null;
  postedAt?: Date | null;
  applicationDeadline?: string | null;
  applicationInstructions?: string | null;
  companyUrl?: string | null;
  companyDescription?: string | null;
  industryCodes?: string[] | null;
  companySize?: string | null;
  positionOfferingCode?: string | null;
  numberOfPosts?: number | null;
  occupationUris?: string[] | null;
  requiredEducationLevel?: string | null;
  requiredExperienceYears?: number | null;
  workingLanguages?: string[] | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  immediateStart?: boolean | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  euresFlag?: boolean | null;
  source?: "manual" | "automation";
  status?: import("@/models/stagedVacancy.model").StagedVacancyStatus;
  promotedToJobId?: string | null;
  archivedAt?: Date | null;
  trashedAt?: Date | null;
  updatedAt?: Date;

  // Match data
  matchScore: number | null;
  matchData: string | null;

  // Timestamps
  discoveredAt: Date | null;
  createdAt: Date;

  // --- Legacy fields (deprecated, absent at runtime) ---
  /** @deprecated Use sourceUrl instead */
  jobUrl?: string | null;
  /** @deprecated Use status instead */
  discoveryStatus?: DiscoveryStatus | null;
  /** @deprecated Use title instead */
  JobTitle?: { label: string };
  /** @deprecated Use employerName instead */
  Company?: { label: string };
  /** @deprecated Use location instead */
  Location?: { label: string } | null;
  /** @deprecated No longer used */
  jobType?: string;
  /** @deprecated No longer used */
  jobTitleId?: string;
  /** @deprecated No longer used */
  companyId?: string;
  /** @deprecated No longer used */
  locationId?: string | null;
}
