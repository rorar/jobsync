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
import type { SalaryPeriod } from "@/models/job.model";

export interface SalaryInput {
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  salaryBonus?: JobBonus | null;
}

export interface JobSalaryColumns {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  salaryBonus: string | null;
  salaryRange: string | null;
}

export function buildJobSalaryData(data: SalaryInput): JobSalaryColumns {
  const salaryMin = data.salaryMin ?? null;
  const salaryMax = data.salaryMax ?? null;
  const salaryCurrency = data.salaryCurrency ? data.salaryCurrency.toUpperCase() : null;
  const salaryPeriod = data.salaryPeriod ?? null;
  const salaryBonus = serializeBonus(data.salaryBonus ?? null);
  // Deprecated computed display string. English from/to fallback — the live UI
  // re-formats the structured fields per locale; salaryRange is a fallback only.
  const salaryRange =
    salaryMin == null && salaryMax == null
      ? null
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
