// StagedVacancy types and interfaces
// Spec: specs/vacancy-pipeline.allium (entity StagedVacancy)

export type StagedVacancyStatus = "staged" | "processing" | "ready" | "promoted" | "dismissed";
export type VacancySource = "manual" | "automation";

export interface StagedVacancy {
  id: string;
  userId: string;
  sourceBoard: string;
  externalId: string | null;
  sourceUrl: string | null;
  title: string;
  employerName: string | null;
  location: string | null;
  description: string | null;
  salary: string | null;
  employmentType: string | null;
  postedAt: Date | null;
  applicationDeadline: string | null;
  applicationInstructions: string | null;
  source: VacancySource;
  automationId: string | null;
  matchScore: number | null;
  matchData: string | null;
  status: StagedVacancyStatus;
  promotedToJobId: string | null;
  archivedAt: Date | null;
  trashedAt: Date | null;
  discoveredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface StagedVacancyWithAutomation extends StagedVacancy {
  automation?: { id: string; name: string } | null;
}

export interface PromotionInput {
  stagedVacancyId: string;
  jobTitleOverride?: string;
  companyOverride?: string;
  locationOverride?: string;
  tagsToApply?: string[];
}

export interface BulkActionResult {
  totalRequested: number;
  succeeded: number;
  failed: number;
  errors: { itemId: string; reason: string }[];
}
