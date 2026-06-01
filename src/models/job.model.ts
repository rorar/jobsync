import { Resume } from "./profile.model";
import type { JobBonus } from "@/lib/salary/bonus";

/**
 * Salary period (Welle 2 Phase 3). Mirrors compensation.allium SalaryPeriod.
 * Single source of truth — derive the union from this `as const` tuple and use
 * it for runtime membership checks (the TS union is erased at runtime, ADR-019).
 */
export const SALARY_PERIODS = ["yearly", "monthly", "hourly"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export interface JobForm {
  id?: string;
  userId?: string;
  source: string;
  title: string;
  type: string;
  company: string;
  location: string;
  status: string;
  dueDate: Date;
  dateApplied?: Date;
  // Structured salary (Welle 2 Phase 3); legacy salaryRange is computed server-side.
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  salaryBonus?: JobBonus | null;
  jobDescription: string;
  jobUrl?: string;
  applied: boolean;
}

export interface Tag {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  _count?: {
    jobs: number;
    questions: number;
  };
}

export interface JobResponse {
  id: string;
  userId: string;
  JobTitle: JobTitle;
  Company: Company;
  Status: JobStatus;
  Location?: JobLocation | null;
  JobSource?: JobSource | null;
  jobType: string;
  createdAt: Date;
  appliedDate: Date | null;
  dueDate: Date | null;
  /** DEPRECATED (Welle 2 Phase 3): computed display string, kept for back-compat. */
  salaryRange: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  /** Raw DB value (expected to be a SalaryPeriod, but typed string for DB fidelity). */
  salaryPeriod?: string | null;
  /** Raw JSON string as stored; parse with parseBonus() at the consumer. */
  salaryBonus?: string | null;
  description?: string;
  jobUrl: string | null;
  applied: boolean;
  resumeId?: string | null;
  Resume?: Resume | null;
  matchScore?: number | null;
  matchData?: string | null;
  sortOrder?: number;
  tags?: Tag[];
  _count?: { Notes?: number };
}

export interface JobTitle {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  _count?: {
    jobs: number;
  };
}

export interface Company {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  logoUrl?: string | null;
  logoAssetId?: string | null;
  _count?: {
    jobsApplied: number;
  };
}

export interface JobStatus {
  id: string;
  label: string;
  value: string;
}

export interface JobSource {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  _count?: {
    jobsApplied: number;
  };
}

export interface JobLocation {
  id: string;
  label: string;
  value: string;
  stateProv?: string | null;
  country?: string | null;
  createdBy: string;
  _count?: {
    jobsApplied: number;
  };
}

export interface Country {
  id: string;
  label: string;
  value: string;
}

export enum JOB_TYPES {
  FT = "Full-time",
  PT = "Part-time",
  C = "Contract",
}
