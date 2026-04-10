/**
 * Shared salary-range formatter for staged-vacancy displays.
 *
 * HIGH-P2B-01 (Sprint 4 full-review resolution): three byte-identical copies
 * of `formatSalaryRange` existed in `DeckCard.tsx`,
 * `StagedVacancyDetailContent.tsx`, and `StagedVacancyCard.tsx`. Sprint 4
 * Stream B hoisted the formatter cache in `StagedVacancyCard.tsx` but the
 * other two copies were not updated — violating the `feedback_flashlight_effect`
 * rule ("scoped fixes leave adjacent blind spots"). `DeckCard.tsx` is the
 * HIGHEST-render-rate consumer (3 mounted cards × 60fps drag × 2 allocations
 * = ~180 formatter allocations per half-second swipe), so the miss cost
 * real performance.
 *
 * H-1 (Sprint 4 Phase 1 code-quality review): the original
 * `SALARY_FORMATTER_CACHE` in `StagedVacancyCard.tsx` was keyed by currency
 * alone and hard-coded the `"de-DE"` locale. A future locale-awareness
 * fix would have needed to re-key the cache or risk poisoning. Fixing the
 * cache to be locale-aware at the same time as the extraction closes both
 * the flashlight gap AND the latent i18n bug in a single move.
 *
 * This module is the SINGLE SOURCE OF TRUTH for salary formatting in the
 * staging UI. Any new consumer MUST import from here.
 */

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Module-scoped formatter cache. Keyed by `${locale}:${currency}` because
 * `Intl.NumberFormat` behavior varies per locale (thousands separator,
 * currency placement, decimal character) AND per currency (symbol, minor
 * unit count). One entry per unique (locale, currency) pair — bounded in
 * practice by `|locales| × |currencies| ≈ 4 × 5 = 20` entries across the
 * whole user base, so no eviction is needed.
 *
 * The cache is process-wide because `Intl.NumberFormat` instances are
 * immutable and thread-safe after construction; sharing across component
 * mounts and re-renders is the whole point.
 */
const SALARY_FORMATTER_CACHE = new Map<string, Intl.NumberFormat>();

function getSalaryFormatter(locale: string, currency: string): Intl.NumberFormat {
  const cacheKey = `${locale}:${currency}`;
  let formatter = SALARY_FORMATTER_CACHE.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    SALARY_FORMATTER_CACHE.set(cacheKey, formatter);
  }
  return formatter;
}

/**
 * Test-only helper: reset the cache so unit tests can observe fresh
 * formatter construction. Do NOT call from production code.
 *
 * @internal
 */
export function _resetSalaryFormatterCacheForTesting(): void {
  SALARY_FORMATTER_CACHE.clear();
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Translate function accepted by `formatSalaryRange`. Callers pass their
 * locale-aware `t` function (either from `useTranslations()` in client
 * components or from `@/i18n/server` in server components).
 *
 * Two keys are required: `staging.salaryFrom` ("ab" in German, "from" in
 * English) and `staging.salaryTo` ("bis" / "to"). These are used when only
 * one of the min/max bounds is present.
 */
export type SalaryRangeTranslate = (
  key: "staging.salaryFrom" | "staging.salaryTo",
) => string;

/**
 * Format a salary range as a localized human-readable string.
 *
 * @param min - lower bound (null if unbounded below)
 * @param max - upper bound (null if unbounded above)
 * @param currency - ISO currency code; defaults to "EUR" when null
 * @param period - optional period suffix (e.g., "MONTH", "YEAR"); "NS" is
 *   treated as "not specified" and omitted
 * @param locale - locale code for number formatting ("de", "en", "fr", "es")
 * @param translate - locale-aware translator for "from"/"to" prefixes
 * @returns formatted string, or "" if both min and max are null
 *
 * Examples:
 *   - `formatSalaryRange(50000, 70000, "EUR", "YEAR", "de", t)`
 *     → "50.000 € – 70.000 € /YEAR"
 *   - `formatSalaryRange(50000, null, "USD", null, "en", t)`
 *     → "from $50,000"
 *   - `formatSalaryRange(null, 70000, "EUR", "MONTH", "de", t)`
 *     → "bis 70.000 € /MONTH"
 *   - `formatSalaryRange(null, null, "EUR", null, "en", t)`
 *     → ""
 */
export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
  period: string | null | undefined,
  locale: string,
  translate: SalaryRangeTranslate,
): string {
  if (min == null && max == null) return "";
  const cur = currency ?? "EUR";
  const formatter = getSalaryFormatter(locale, cur);
  const fmt = (n: number) => formatter.format(n);

  const parts: string[] = [];
  if (min != null && max != null && min !== max) {
    parts.push(`${fmt(min)} – ${fmt(max)}`);
  } else if (min != null && max != null && min === max) {
    // Exact salary — render a single amount without a prefix.
    parts.push(fmt(min));
  } else if (min != null) {
    parts.push(`${translate("staging.salaryFrom")} ${fmt(min)}`);
  } else if (max != null) {
    parts.push(`${translate("staging.salaryTo")} ${fmt(max)}`);
  }
  if (period && period !== "NS") {
    parts.push(`/${period}`);
  }
  return parts.join(" ");
}
