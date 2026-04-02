/**
 * Locale-aware duration formatting utility.
 *
 * Formats seconds into human-readable duration strings using i18n keys
 * for time unit labels (S2R-BS5+BS6 fix).
 *
 * Usage:
 *   import { formatDuration } from "@/lib/format-duration";
 *   formatDuration(3725, t) // "1h 2m 5s"
 */

/**
 * Translation function type — accepts an i18n key and returns the translated string.
 * Compatible with both `useTranslations().t` and `@/i18n/server.t`.
 */
type TranslationFunction = (key: string) => string;

/**
 * Format a duration in seconds into a human-readable string.
 *
 * Three tiers:
 * - >= 3600: "Xh Ym Zs" (hours, minutes, seconds)
 * - >= 60:   "Xm Ys" (minutes, seconds)
 * - < 60:    "Xs" (seconds only)
 *
 * @param seconds - Duration in seconds (negative/NaN guarded to 0)
 * @param t - Translation function for i18n unit keys
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number, t: TranslationFunction): string {
  // Guard against negative/NaN/Infinity
  const safe = Math.max(0, isNaN(seconds) || !isFinite(seconds) ? 0 : Math.floor(seconds));

  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;

  if (h > 0) {
    return `${h}${t("common.hourShort")} ${m}${t("common.minuteShort")} ${s}${t("common.secondShort")}`;
  }
  if (m > 0) {
    return `${m}${t("common.minuteShort")} ${s}${t("common.secondShort")}`;
  }
  return `${s}${t("common.secondShort")}`;
}
