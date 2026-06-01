/**
 * bonus.ts — Welle 2 Phase 3 (F-AJ-05)
 *
 * The flexible Job bonus value object, persisted as JSON on `Job.salaryBonus`.
 * Pure + dependency-light. Validation mirrors the compensation.allium invariants
 * (fixed→amount, percentage→percentage, mixed→both) so a bad shape is never
 * written or surfaced.
 *
 * JSON-backed (rather than flat columns) so the shape can grow additively
 * (e.g. a future payout cap — see compensation.allium open question) without a
 * schema migration.
 */

export type BonusKind = "fixed" | "percentage" | "mixed";

export interface JobBonus {
  kind: BonusKind;
  amount?: number | null; // absolute (kinds: fixed, mixed)
  percentage?: number | null; // share, e.g. 30 (kinds: percentage, mixed)
  condition?: string | null; // free text, e.g. "after reaching sales goal"
}

const BONUS_KINDS: ReadonlySet<string> = new Set(["fixed", "percentage", "mixed"]);

/** True iff the bonus satisfies the kind→field requirements. */
export function isValidBonus(bonus: JobBonus | null | undefined): boolean {
  if (!bonus || typeof bonus !== "object") return false;
  if (!BONUS_KINDS.has(bonus.kind)) return false;
  const hasAmount = typeof bonus.amount === "number" && !Number.isNaN(bonus.amount);
  const hasPct = typeof bonus.percentage === "number" && !Number.isNaN(bonus.percentage);
  switch (bonus.kind) {
    case "fixed":
      return hasAmount;
    case "percentage":
      return hasPct;
    case "mixed":
      return hasAmount && hasPct;
    default:
      return false;
  }
}

/** Build a canonical JobBonus from arbitrary input, or null if invalid. */
function canonical(input: unknown): JobBonus | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const kind = o.kind;
  if (typeof kind !== "string" || !BONUS_KINDS.has(kind)) return null;

  const out: JobBonus = { kind: kind as BonusKind };
  // Amounts must be finite & ≥0; percentage additionally capped at 1000% — an
  // out-of-range value is dropped (then isValidBonus rejects the whole bonus if
  // the kind required it). Mirrors the Zod bounds on both write schemas.
  if (typeof o.amount === "number" && Number.isFinite(o.amount) && o.amount >= 0) {
    out.amount = o.amount;
  }
  if (
    typeof o.percentage === "number" &&
    Number.isFinite(o.percentage) &&
    o.percentage >= 0 &&
    o.percentage <= 1000
  ) {
    out.percentage = o.percentage;
  }
  if (typeof o.condition === "string" && o.condition.trim() !== "") {
    out.condition = o.condition.trim();
  }

  return isValidBonus(out) ? out : null;
}

/** Parse the persisted JSON into a validated JobBonus, or null. */
export function parseBonus(json: string | null | undefined): JobBonus | null {
  if (json == null || json === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  return canonical(parsed);
}

/** Serialize a JobBonus to JSON, or null when the bonus is absent/invalid. */
export function serializeBonus(bonus: JobBonus | null | undefined): string | null {
  const c = canonical(bonus);
  return c ? JSON.stringify(c) : null;
}

/**
 * Locale-aware display string for a bonus value part (no "Bonus:" label — the
 * caller supplies that). Returns "" for an invalid/absent bonus.
 */
export function formatBonus(
  bonus: JobBonus | null | undefined,
  currency: string | null | undefined,
  locale: string,
): string {
  const c = canonical(bonus);
  if (!c) return "";

  const cur = currency ?? "EUR";
  const amountStr =
    c.amount != null
      ? new Intl.NumberFormat(locale, {
          style: "currency",
          currency: cur,
          maximumFractionDigits: 0,
        }).format(c.amount)
      : "";
  const pctStr = c.percentage != null ? `${c.percentage}%` : "";

  let value = "";
  if (c.kind === "fixed") value = amountStr;
  else if (c.kind === "percentage") value = pctStr;
  else value = [amountStr, pctStr].filter(Boolean).join(" + ");

  if (c.condition) value = `${value} (${c.condition})`;
  return value;
}
