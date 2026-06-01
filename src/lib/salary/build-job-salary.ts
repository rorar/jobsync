/**
 * build-job-salary.ts — Welle 2 Phase 3 (F-AJ-05)
 *
 * Shared (non-"use server") builder that maps validated salary input to the
 * persisted Job columns, computing the DEPRECATED `salaryRange` display string
 * for /api/v1 back-compat. Used by BOTH the job.actions Repository and the
 * /api/v1/jobs route handlers so the two write paths stay consistent.
 */

import { formatSalaryRange } from "@/lib/staging/format-salary-range";
import { serializeBonus, type JobBonus } from "@/lib/salary/bonus";
import { SALARY_PERIODS, type SalaryPeriod } from "@/models/job.model";
import { isValidCurrencyCode } from "@/lib/connector/reference-data/modules/currency/currency-data";

export interface SalaryInput {
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  salaryBonus?: JobBonus | null;
  /**
   * Original free-text salary to retain in the deprecated `salaryRange` column
   * when NO structured amounts could be derived (e.g. promoting a vacancy whose
   * salary is "competitive"). Prevents the legacy verbatim value being dropped.
   */
  salaryRangeFallback?: string | null;
}

export interface JobSalaryColumns {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  salaryBonus: string | null;
  salaryRange: string | null;
}

/** Coerce to a finite, non-negative number or null (rejects NaN/Infinity/<0). */
function sanitizeAmount(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Map validated salary input to the persisted Job columns.
 *
 * SERVER-SIDE VALIDATION BOUNDARY (ADR-019): the internal `addJob`/`updateJob`
 * Server Actions do not re-`safeParse` the form, so this shared builder is the
 * single choke point that sanitises every salary field for ALL four write paths
 * (actions ×2, /api/v1 legacy-fallback branch, promoter). It NEVER throws —
 * invalid sub-fields degrade to null, mirroring the best-effort parser contract.
 *   - amounts  → finite & ≥0, else null
 *   - currency → uppercased ISO-4217 active code, else null
 *   - period   → SALARY_PERIODS membership, else null
 *   - min/max  → swapped when inverted so `salaryMax >= salaryMin` always holds
 *               (compensation.allium SalaryMaxGteMin)
 */
export function buildJobSalaryData(data: SalaryInput): JobSalaryColumns {
  let salaryMin = sanitizeAmount(data.salaryMin);
  let salaryMax = sanitizeAmount(data.salaryMax);
  if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
    [salaryMin, salaryMax] = [salaryMax, salaryMin];
  }

  const upper = data.salaryCurrency ? data.salaryCurrency.toUpperCase() : null;
  const salaryCurrency = upper && isValidCurrencyCode(upper) ? upper : null;

  const salaryPeriod =
    data.salaryPeriod && (SALARY_PERIODS as readonly string[]).includes(data.salaryPeriod)
      ? data.salaryPeriod
      : null;

  const salaryBonus = serializeBonus(data.salaryBonus ?? null);

  // Deprecated computed display string. English from/to fallback — the live UI
  // re-formats the structured fields per locale; salaryRange is a fallback only.
  // When no structured amount exists, retain any provided free-text fallback so
  // an unparseable legacy salary (e.g. "competitive") is not silently dropped.
  const salaryRange =
    salaryMin == null && salaryMax == null
      ? (data.salaryRangeFallback?.trim() || null)
      : formatSalaryRange(
          salaryMin,
          salaryMax,
          salaryCurrency,
          salaryPeriod,
          "en",
          (k) => (k === "staging.salaryFrom" ? "from" : "to"),
        );
  return { salaryMin, salaryMax, salaryCurrency, salaryPeriod, salaryBonus, salaryRange };
}
