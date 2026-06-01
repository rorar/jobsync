/**
 * parse-salary-range.ts — Welle 2 Phase 3 (F-AJ-05)
 *
 * Best-effort parser converting the legacy free-text `Job.salaryRange` into the
 * structured shape { salaryMin, salaryMax, salaryCurrency, salaryPeriod }. Drives
 * the migration backfill. Pure + dependency-light (only the CUR validator).
 *
 * Design notes:
 * - Legacy `salaryRange` is a MIX of SALARY_RANGES bucket ids ("1".."16",
 *   form-created), free-text ranges, and arbitrary promoter text.
 * - NEVER drops a value: unparseable input returns `unparsed: true` + the
 *   original string preserved, so the migration can flag/retain it.
 * - All regexes are linear (no nested quantifiers) — ReDoS-safe, consistent
 *   with the project's egress-scrubber discipline.
 */

import { SALARY_RANGES } from "@/lib/data/salaryRangeData";
import { isValidCurrencyCode } from "@/lib/connector/reference-data/modules/currency/currency-data";

export type SalaryPeriod = "yearly" | "monthly" | "hourly";

export interface ParsedSalary {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: SalaryPeriod | null;
  /** True when the input held text but no salary figures could be extracted. */
  unparsed: boolean;
  /** The original input, preserved verbatim (never dropped). */
  original: string;
}

const SYMBOL_TO_CODE: Record<string, string> = {
  "€": "EUR",
  $: "USD",
  "£": "GBP",
  "¥": "JPY",
};

function detectCurrency(text: string): string | null {
  for (const sym of Object.keys(SYMBOL_TO_CODE)) {
    if (text.includes(sym)) return SYMBOL_TO_CODE[sym];
  }
  // Explicit ISO-4217 code as a standalone 3-letter word.
  const m = text.toUpperCase().match(/\b[A-Z]{3}\b/);
  if (m && isValidCurrencyCode(m[0])) return m[0];
  return null;
}

function detectPeriod(text: string): SalaryPeriod | null {
  const l = text.toLowerCase();
  if (/per\s*hour|\/\s*h(?:ou)?r|hourly|\bstunde|pro stunde|\/h\b/.test(l)) return "hourly";
  if (/per\s*month|\/\s*month|monthly|\bmonat|pro monat|monatlich|\bp\.?m\b/.test(l)) return "monthly";
  if (/per\s*year|\/\s*year|yearly|annual|\bp\.?a\b|\bjahr|pro jahr|j[äa]hrlich/.test(l)) return "yearly";
  return null;
}

/** Normalize a numeric token: handle the `k` suffix and thousands separators. */
function normalizeNumber(token: string): number {
  let t = token.trim();
  let multiplier = 1;
  if (/[kK]$/.test(t)) {
    multiplier = 1000;
    t = t.replace(/[kK]$/, "").trim();
  }
  // Strip a separator that groups exactly three digits (thousands): "90,000",
  // "50.000", "1,234,567". A lone separator before <3 digits is a decimal.
  t = t.replace(/[.,](?=\d{3}(?:\D|$))/g, "");
  // Any remaining comma is a decimal separator → normalize to a dot.
  t = t.replace(/,/g, ".");
  const n = parseFloat(t);
  return Number.isNaN(n) ? NaN : n * multiplier;
}

/** Extract numeric figures (with k/thousands handling) in order of appearance. */
function extractNumbers(text: string): number[] {
  const tokens = text.match(/\d[\d.,]*\s*[kK]?/g) ?? [];
  const nums: number[] = [];
  for (const tok of tokens) {
    const n = normalizeNumber(tok);
    if (!Number.isNaN(n)) nums.push(n);
  }
  return nums;
}

function empty(original: string, unparsed: boolean): ParsedSalary {
  return {
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    unparsed,
    original,
  };
}

export function parseSalaryRange(raw: string | null | undefined): ParsedSalary {
  if (raw == null) return empty("", false);
  const original = String(raw);
  const trimmed = original.trim();
  if (trimmed === "") return empty("", false);

  // A SALARY_RANGES bucket id ("1".."16") → resolve to its display range first.
  const bucket = SALARY_RANGES.find((b) => b.id === trimmed);
  const text = bucket ? bucket.value : trimmed;

  const salaryCurrency = detectCurrency(text);
  const salaryPeriod = detectPeriod(text);
  const nums = extractNumbers(text);

  if (nums.length === 0) {
    // Text but no figures → keep it; flag unparsed so the migration can retain it.
    return { ...empty(original, true), salaryCurrency, salaryPeriod };
  }

  const lower = text.toLowerCase();
  const isLowerBound = /(^|\s)(?:>|≥|from |ab |mind|at least)/.test(lower) || lower.includes(">");
  const isUpperBound = /(^|\s)(?:<|≤|up to|bis |max)/.test(lower);

  let salaryMin: number | null = null;
  let salaryMax: number | null = null;

  if (nums.length === 1) {
    const v = nums[0];
    if (isLowerBound) {
      salaryMin = v;
    } else if (isUpperBound) {
      salaryMax = v;
    } else {
      // A bare single figure is a fixed salary (Fixum): min == max.
      salaryMin = v;
      salaryMax = v;
    }
  } else {
    const [a, b] = [nums[0], nums[1]];
    salaryMin = Math.min(a, b);
    salaryMax = Math.max(a, b);
  }

  return { salaryMin, salaryMax, salaryCurrency, salaryPeriod, unparsed: false, original };
}
