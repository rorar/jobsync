/**
 * insideTrack.model.ts — Welle 5 (Inside Track) domain model.
 *
 * Enums, runtime guards (ADR-019 — SQLite has no native enums, so the controlled
 * vocabularies are enforced app-level, mirroring JobContactRole / RelationshipType),
 * the Referral lifecycle transition graph, and config constants.
 *
 * SoT: specs/inside-track.allium — enums ConnectionKind / ConnectionStrength,
 * entity Referral (`kind`, `status`, `transitions status`), config block.
 */

// ---------------------------------------------------------------------------
// Enums (controlled vocabularies)
// ---------------------------------------------------------------------------

/** Referral sum-type discriminator (inside-track.allium `kind: InsiderRelay | NetworkPath`). */
export const REFERRAL_KINDS = ["insider_relay", "network_path"] as const;
export type ReferralKind = (typeof REFERRAL_KINDS)[number];

/** Referral lifecycle states (inside-track.allium `status`). */
export const REFERRAL_STATUSES = [
  "open",
  "engaged",
  "relayed",
  "in_review",
  "converted",
  "declined",
  "stale",
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** Person-to-person edge kind (inside-track.allium `enum ConnectionKind`). */
export const CONNECTION_KINDS = [
  "former_colleague",
  "friend",
  "acquaintance",
  "mentor",
  "family",
  "other",
] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

/** Edge strength (inside-track.allium `enum ConnectionStrength`). */
export const CONNECTION_STRENGTHS = ["close", "medium", "weak"] as const;
export type ConnectionStrength = (typeof CONNECTION_STRENGTHS)[number];

// ---------------------------------------------------------------------------
// Runtime membership guards (ADR-019 — erased-union boundary defence)
// ---------------------------------------------------------------------------

export function isValidReferralKind(value: unknown): value is ReferralKind {
  return typeof value === "string" && (REFERRAL_KINDS as readonly string[]).includes(value);
}

export function isValidReferralStatus(value: unknown): value is ReferralStatus {
  return typeof value === "string" && (REFERRAL_STATUSES as readonly string[]).includes(value);
}

export function isValidConnectionKind(value: unknown): value is ConnectionKind {
  return typeof value === "string" && (CONNECTION_KINDS as readonly string[]).includes(value);
}

export function isValidConnectionStrength(value: unknown): value is ConnectionStrength {
  return typeof value === "string" && (CONNECTION_STRENGTHS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Referral lifecycle transition graph (inside-track.allium `transitions status`)
// ---------------------------------------------------------------------------

/**
 * Legal `status` transitions. ONE semantic graph shared by both variants.
 * `converted` and `declined` are terminal (no outgoing edges); `stale` is
 * reachable from every working state and revivable (stale -> open).
 */
const REFERRAL_TRANSITIONS: Readonly<Record<ReferralStatus, readonly ReferralStatus[]>> = {
  open: ["engaged", "declined", "stale"],
  engaged: ["relayed", "declined", "stale"],
  relayed: ["in_review", "declined", "stale"],
  in_review: ["converted", "declined", "stale"],
  stale: ["open", "declined"],
  converted: [],
  declined: [],
};

/** True iff `from -> to` is a legal Referral lifecycle transition. */
export function isValidReferralTransition(from: unknown, to: unknown): boolean {
  if (!isValidReferralStatus(from) || !isValidReferralStatus(to)) return false;
  return REFERRAL_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Config (inside-track.allium `config` block)
// ---------------------------------------------------------------------------

export const INSIDE_TRACK_CONFIG = Object.freeze({
  /** A referral with no activity for this long goes stale (spec: 21.days). */
  staleAfterDays: 21,
  /** Maximum hops the warm-path finder traverses (spec: 2 = friend -> insider). */
  maxWarmPathDepth: 2,
  /** Network size cap per user (spec: mirrors CRM_CONFIG limits). */
  maxConnectionsPerUser: 10000,
} as const);
