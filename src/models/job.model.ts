import { Resume } from "./profile.model";
import type { JobBonus } from "@/lib/salary/bonus";

/**
 * Salary period (Welle 2 Phase 3). Mirrors compensation.allium SalaryPeriod.
 * Single source of truth — derive the union from this `as const` tuple and use
 * it for runtime membership checks (the TS union is erased at runtime, ADR-019).
 */
export const SALARY_PERIODS = ["yearly", "monthly", "hourly"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

/**
 * Recruiter-triangle relationship type (Welle 3 F-AJ-08). Describes the role of
 * the optional `recruitingCompany` relative to the hiring `Company` on a Job:
 * the candidate sits across from a hiring company that may be reached via a
 * recruiting/staffing intermediary. Single source of truth — the TS union is
 * erased at runtime, so validate membership at the server-action boundary
 * (ADR-019). `null`/absent = no recruiter (direct application).
 */
export const RELATIONSHIP_TYPES = [
  "direct",
  "recruiting_agency",
  "staffing_agency",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Runtime membership check for the erased RelationshipType union (ADR-019). */
export function isValidRelationshipType(value: unknown): value is RelationshipType {
  return (
    typeof value === "string" &&
    (RELATIONSHIP_TYPES as readonly string[]).includes(value)
  );
}

/**
 * JobContactRole — controlled vocabulary for a Person's function in the hiring
 * process for a specific Job (the JobContact link). SoT: specs/crm.allium
 * `enum JobContactRole`. A closed, classifiable set — powers role badges
 * (ROADMAP 2244) and warm-path / referral filtering (inside-track.allium).
 * Distinct from CompanyAssociation.position (a free-text job title). A `null`
 * JobContact.role means "unspecified"; there is deliberately NO `other` member
 * (Allium: force ambiguity into the open — add a value rather than hide it).
 */
export const JOB_CONTACT_ROLES = [
  "recruiter",
  "hiring_manager",
  "hr",
  "referral",
  "tipster",
  "interviewer",
  "decision_maker",
] as const;
export type JobContactRole = (typeof JOB_CONTACT_ROLES)[number];

/** Runtime membership check for the erased JobContactRole union (ADR-019). */
export function isValidJobContactRole(value: unknown): value is JobContactRole {
  return (
    typeof value === "string" &&
    (JOB_CONTACT_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Known synonyms for the one-off migration of legacy free-text JobContact.role
 * values (Welle 5 Task 1.3). Keyed by the normalized form (lowercased, runs of
 * whitespace/hyphens collapsed to a single underscore).
 */
const LEGACY_CONTACT_ROLE_SYNONYMS: Record<string, JobContactRole> = {
  recruiting: "recruiter",
  human_resources: "hr",
  referrer: "referral",
  tip: "tipster",
  tippgeber: "tipster",
};

/**
 * Maps a legacy free-text JobContact.role string to a canonical JobContactRole.
 * Known strings (incl. case/separator variants and a small synonym table) map
 * to the matching enum; everything unmappable (and empty/nullish) maps to null.
 * Pure + dependency-free so the migration script and unit tests can both use it.
 */
export function mapLegacyContactRole(
  raw: string | null | undefined,
): JobContactRole | null {
  if (raw == null) return null;
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized.length === 0) return null;
  if (isValidJobContactRole(normalized)) return normalized;
  return LEGACY_CONTACT_ROLE_SYNONYMS[normalized] ?? null;
}

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
  // Welle 3 (F-AJ-08): recruiter triangle.
  RecruitingCompany?: Company | null;
  recruitingCompanyId?: string | null;
  relationshipType?: string | null;
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

/**
 * Stage (category) a JobStatus belongs to. Carries the workflow semantics that
 * drive Kanban column order/colour/collapse, applied-derivation and transition
 * validity (Welle 4, F-AJ-09). Optional on JobStatus because some lightweight
 * status payloads (e.g. the Kanban server response) omit it.
 */
export interface JobStatusCategoryRef {
  id: string;
  kind: string;
  label: string;
  colour: string;
  sortOrder: number;
  isAppliedStage: boolean;
  isTerminal: boolean;
  defaultCollapsed: boolean;
  allowsSelfTransition: boolean;
}

export interface JobStatus {
  id: string;
  label: string;
  value: string;
  sortOrder?: number;
  isDefault?: boolean;
  category?: JobStatusCategoryRef;
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
