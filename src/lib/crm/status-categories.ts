/**
 * Status Categories — pure domain layer for Custom JobStatus (Welle 4, F-AJ-09).
 *
 * The fixed `JobStatus` enum + hardcoded VALID_TRANSITIONS matrix are superseded
 * by a per-user model where each status belongs to one of seven FIXED system
 * categories ("stages"). The category `kind` carries the immutable workflow
 * semantics; users only add/rename statuses and recolour/reorder stages.
 *
 * This module is the single source of truth for those semantics. It is a pure,
 * dependency-free leaf (no DB, no React) so it can be reused by the Job-Status
 * Repository, the API layer, the Kanban derivation and the migration.
 *
 * Spec: specs/job-status.allium
 *   - enum StatusCategoryKind + invariant SemanticsMatchKind
 *   - rule TransitionJobStatus (category-ordered + bounded reopen)
 *   - AppliedFlagDerivedFromCategory
 *   - rule MigrateLegacyStatusesToPerUser (legacy value mapping)
 */

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

/** The seven fixed system category kinds, in workflow (sort) order. */
export const STATUS_CATEGORY_KINDS = [
  "lead",
  "applied",
  "interviewing",
  "offer",
  "won",
  "lost",
  "archived",
] as const;

export type StatusCategoryKind = (typeof STATUS_CATEGORY_KINDS)[number];

/** Runtime membership check for an erased union at a trust boundary (ADR-019). */
export function isStatusCategoryKind(value: unknown): value is StatusCategoryKind {
  return typeof value === "string" && (STATUS_CATEGORY_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Semantics (spec invariant SemanticsMatchKind)
// ---------------------------------------------------------------------------

export interface CategorySemantics {
  kind: StatusCategoryKind;
  /** Workflow position; drives Kanban column order + transition validity. */
  sortOrder: number;
  /** Jobs in this stage count as "applied" (drives Job.applied). */
  isAppliedStage: boolean;
  /** Truly terminal stage (won only). */
  isTerminal: boolean;
  /** Collapsed by default in the Kanban (lost, archived). */
  defaultCollapsed: boolean;
  /** Same-status self-transition allowed (interviewing multi-round). */
  allowsSelfTransition: boolean;
}

/** Seed presentation + semantics per kind (label/colour are user-editable later). */
export const CATEGORY_SEED: Record<
  StatusCategoryKind,
  CategorySemantics & { label: string; colour: string }
> = {
  lead: { kind: "lead", sortOrder: 0, label: "Lead", colour: "blue", isAppliedStage: false, isTerminal: false, defaultCollapsed: false, allowsSelfTransition: false },
  applied: { kind: "applied", sortOrder: 1, label: "Applied", colour: "indigo", isAppliedStage: true, isTerminal: false, defaultCollapsed: false, allowsSelfTransition: false },
  interviewing: { kind: "interviewing", sortOrder: 2, label: "Interviewing", colour: "purple", isAppliedStage: true, isTerminal: false, defaultCollapsed: false, allowsSelfTransition: true },
  offer: { kind: "offer", sortOrder: 3, label: "Offer", colour: "green", isAppliedStage: true, isTerminal: false, defaultCollapsed: false, allowsSelfTransition: false },
  won: { kind: "won", sortOrder: 4, label: "Won", colour: "emerald", isAppliedStage: true, isTerminal: true, defaultCollapsed: false, allowsSelfTransition: false },
  lost: { kind: "lost", sortOrder: 5, label: "Lost", colour: "red", isAppliedStage: false, isTerminal: false, defaultCollapsed: true, allowsSelfTransition: false },
  archived: { kind: "archived", sortOrder: 6, label: "Archived", colour: "gray", isAppliedStage: false, isTerminal: false, defaultCollapsed: true, allowsSelfTransition: false },
};

/** The semantics for a kind, derived purely from the kind (SemanticsMatchKind). */
export function categorySemanticsForKind(kind: StatusCategoryKind): CategorySemantics {
  const { label: _label, colour: _colour, ...semantics } = CATEGORY_SEED[kind];
  return semantics;
}

// ---------------------------------------------------------------------------
// Default seed status set (per-user, on first access / migration)
// ---------------------------------------------------------------------------

export interface SeedStatus {
  value: string;
  label: string;
  kind: StatusCategoryKind;
  sortOrder: number;
  isDefault: boolean;
}

/**
 * The eight statuses every user is seeded with, mirroring the historical CRM set.
 * "bookmarked" (lead) is the default new-job status. "expired" sits under the
 * archived stage (both reactivatable, not-applied, collapsed).
 */
export const DEFAULT_STATUS_SEED: readonly SeedStatus[] = [
  { value: "bookmarked", label: "Bookmarked", kind: "lead", sortOrder: 0, isDefault: true },
  { value: "applied", label: "Applied", kind: "applied", sortOrder: 0, isDefault: false },
  { value: "interview", label: "Interview", kind: "interviewing", sortOrder: 0, isDefault: false },
  { value: "offer", label: "Offer", kind: "offer", sortOrder: 0, isDefault: false },
  { value: "accepted", label: "Accepted", kind: "won", sortOrder: 0, isDefault: false },
  { value: "rejected", label: "Rejected", kind: "lost", sortOrder: 0, isDefault: false },
  { value: "archived", label: "Archived", kind: "archived", sortOrder: 0, isDefault: false },
  { value: "expired", label: "Expired", kind: "archived", sortOrder: 1, isDefault: false },
];

/**
 * Maps any legacy global status value onto the seeded per-user value during
 * migration. Legacy "draft"/"saved"/"new" collapse to "bookmarked"; all current
 * values map to themselves. Unknown values fall back to the user's default at
 * the call site (see migration).
 */
export const LEGACY_VALUE_TO_SEED_VALUE: Record<string, string> = {
  draft: "bookmarked",
  saved: "bookmarked",
  new: "bookmarked",
  bookmarked: "bookmarked",
  applied: "applied",
  interview: "interview",
  offer: "offer",
  accepted: "accepted",
  rejected: "rejected",
  archived: "archived",
  expired: "expired",
};

// ---------------------------------------------------------------------------
// Transition validity (spec rule TransitionJobStatus + CategoryOrderedTransition)
// ---------------------------------------------------------------------------

export interface TransitionOptions {
  /** The move targets the SAME status row (re-selection), not a different one. */
  sameStatus?: boolean;
  /** config.allow_reopen_from_closed (default true). */
  allowReopenFromClosed?: boolean;
  /** config.default_initial_kind — the only stage a closed job may reopen into. */
  defaultStageKind?: StatusCategoryKind;
}

/**
 * Category-ordered transition validity.
 *
 * - Same status (re-selection): allowed only when the category allows self-
 *   transition (interviewing multi-round). For different statuses, sameStatus
 *   is false and the rules below apply.
 * - Forward / lateral: target stage sort_order >= source stage sort_order.
 * - Bounded reopen: from a CLOSED stage (terminal `won` or default-collapsed
 *   `lost`/`archived`) a job may be reopened ONLY into the default stage
 *   (defaultStageKind, normally `lead`) — never to an arbitrary earlier stage.
 *
 * Intentionally more permissive than the old value->value matrix for forward
 * jumps (e.g. lead -> won is allowed); the reopen path is deliberately tighter
 * to keep an audit-relevant guard.
 */
export function isValidCategoryTransition(
  from: CategorySemantics,
  to: CategorySemantics,
  opts: TransitionOptions = {},
): boolean {
  const allowReopen = opts.allowReopenFromClosed ?? true;
  const defaultStageKind = opts.defaultStageKind ?? "lead";

  if (opts.sameStatus) {
    // Re-selecting the same status is only meaningful for self-transition stages.
    return from.allowsSelfTransition;
  }

  // Forward or lateral progression.
  if (to.sortOrder >= from.sortOrder) return true;

  // Bounded reopen from a closed stage back to the default stage only.
  const fromIsClosed = from.isTerminal || from.defaultCollapsed;
  if (allowReopen && fromIsClosed && to.kind === defaultStageKind) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Applied side effect (spec AppliedFlagDerivedFromCategory)
// ---------------------------------------------------------------------------

export interface AppliedSideEffect {
  applied?: true;
  /** Set only on FIRST entry into an applied stage (immutability). */
  appliedDate?: Date;
}

/**
 * Side effects to merge into a Job when transitioning INTO `toCategory`.
 * Derives `applied` from the category's is_applied_stage (NOT a value-string
 * match), and sets appliedDate only on the first applied-stage entry.
 */
export function computeAppliedSideEffect(
  toCategory: CategorySemantics,
  currentAppliedDate: Date | null,
): AppliedSideEffect {
  if (!toCategory.isAppliedStage) return {};
  return {
    applied: true,
    ...(currentAppliedDate === null ? { appliedDate: new Date() } : {}),
  };
}
