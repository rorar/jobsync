/**
 * CRM Person domain types.
 * Spec: specs/crm.allium — entity Person, value FullName/TypedEmail/TypedPhone/Address
 */

// ---------------------------------------------------------------------------
// Value Objects (stored as JSON in Prisma)
// ---------------------------------------------------------------------------

export interface TypedEmail {
  email: string;
  type: ContactChannelType;
  isPrimary: boolean;
}

export interface TypedPhone {
  number: string;
  type: ContactChannelType;
  isPrimary: boolean;
}

export interface Address {
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface CompanyAssociation {
  companyId: string;
  companyLabel: string;
  role?: string | null;
  isPrimary: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface SocialProfile {
  platform: SocialPlatform;
  url: string;
}

export interface FullName {
  firstName: string | null;
  lastName: string | null;
}

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type ContactChannelType = "work" | "home" | "other";

export type PersonStatus = "active" | "archived" | "anonymized";

export type SocialPlatform = "linkedin" | "xing" | "github" | "twitter" | "other";

export type DataSource = "manual" | "auto_created" | "imported";

export type ProcessingBasis = "legitimate_interest" | "consent" | "contract";

export type ActorSource =
  | "manual"
  | "import"
  | "api"
  | "system"
  | "workflow"
  | "email"
  | "calendar";

export type InterviewStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";

export type InterviewOutcome = "pending" | "passed" | "rejected" | "waitlisted";

export type CrmTaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export type ActivityType =
  | "status_changed"
  | "note_added"
  | "task_created"
  | "task_completed"
  | "interview_scheduled"
  | "interview_completed"
  | "contact_created"
  | "contact_updated"
  | "email_sent"
  | "email_received"
  | "call_logged"
  | "document_attached"
  | "reminder_triggered"
  | "follow_up_sent"
  | "application_submitted"
  | "contact_deleted"
  | "automation_degraded";

export type BlocklistType = "email" | "phone" | "domain";

// ---------------------------------------------------------------------------
// State Machine Validators
// ---------------------------------------------------------------------------

const VALID_PERSON_TRANSITIONS: Record<PersonStatus, PersonStatus[]> = {
  active: ["archived", "anonymized"],
  archived: ["active"],
  anonymized: [],
};

const VALID_INTERVIEW_TRANSITIONS: Record<InterviewStatus, InterviewStatus[]> = {
  scheduled: ["completed", "cancelled", "rescheduled"],
  rescheduled: ["completed", "cancelled", "rescheduled"],
  completed: [],
  cancelled: [],
};

const VALID_TASK_TRANSITIONS: Record<CrmTaskStatus, CrmTaskStatus[]> = {
  pending: ["in_progress", "done", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export function isValidPersonTransition(from: PersonStatus, to: PersonStatus): boolean {
  return VALID_PERSON_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isValidInterviewTransition(from: InterviewStatus, to: InterviewStatus): boolean {
  return VALID_INTERVIEW_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isValidTaskTransition(from: CrmTaskStatus, to: CrmTaskStatus): boolean {
  return VALID_TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Polymorphic Target validation (ExactlyOneTarget invariant)
// ---------------------------------------------------------------------------

export interface PolymorphicTarget {
  targetPersonId?: string | null;
  targetCompanyId?: string | null;
  targetJobId?: string | null;
}

export function validateExactlyOneTarget(target: PolymorphicTarget): boolean {
  const setCount = [target.targetPersonId, target.targetCompanyId, target.targetJobId]
    .filter((id) => id != null && id !== "")
    .length;
  return setCount === 1;
}

// ---------------------------------------------------------------------------
// JSON parse helpers (safe parse for JSON columns)
// ---------------------------------------------------------------------------

export function parseEmails(raw: string | null | undefined): TypedEmail[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parsePhones(raw: string | null | undefined): TypedPhone[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseCompanies(raw: string | null | undefined): CompanyAssociation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseSocialProfiles(raw: string | null | undefined): SocialProfile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// AtMostOnePrimaryCompany invariant (specs/crm.allium)
// ---------------------------------------------------------------------------

export function validateAtMostOnePrimaryCompany(companies: CompanyAssociation[]): boolean {
  return companies.filter((c) => c.isPrimary).length <= 1;
}

// ---------------------------------------------------------------------------
// Config constants (from crm.allium config)
// ---------------------------------------------------------------------------

export const CRM_CONFIG = {
  autoCreatedRetentionDays: 730,
  timelineRetentionDays: 1095,
  interviewReminderBeforeHours: 24,
  followUpDefaultDelayDays: 7,
  maxPersonsPerUser: 10000,
  maxTasksPerUser: 5000,
  maxBlocklistEntries: 1000,
  maxConnectedAccounts: 5,
} as const;
