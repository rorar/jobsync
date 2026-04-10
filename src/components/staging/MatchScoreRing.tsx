"use client";

/**
 * MatchScoreRing
 *
 * Shared circular SVG ring that visualizes a vacancy match score (0-100).
 *
 * Extracted from `DeckCard.tsx` and `StagedVacancyDetailContent.tsx`
 * (each previously had its own behaviorally identical local copy).
 *
 * Color thresholds (kept identical across both legacy copies):
 *   >= 80  → emerald
 *   >= 60  → blue
 *   >= 40  → amber
 *   <  40  → red
 *
 * The component is null/undefined safe — when `score` is missing, a muted
 * placeholder ring with an em-dash is rendered. Both call sites already
 * guard against null externally, but the safety net keeps the contract
 * crisp and avoids accidental NaN renders if a caller forgets.
 *
 * Accessibility (Sprint 2 Stream G H-Y-01 / H-Y-02):
 *
 * The old implementation hardcoded `aria-label="Match score: {score}"` in
 * English, which DE/FR/ES users heard untranslated. It was ALSO redundant
 * with DeckCard's sr-only sibling span that already announced the score in
 * the user's locale — AT users heard the score twice.
 *
 * The fix exposes two accessibility props:
 *
 *   - `ariaLabel`  — optional translated label. When provided AND
 *                    `ariaHidden` is falsy, it becomes the SVG's accessible
 *                    name (`role="img"` + `aria-label`). Callers MUST pass
 *                    a locale-translated string.
 *   - `ariaHidden` — when `true`, the SVG is hidden from assistive tech
 *                    entirely (`role="presentation"`, `aria-hidden="true"`).
 *                    Use this in DeckCard where a visually-hidden sibling
 *                    span already announces the score in the user's locale.
 *
 * When neither prop is set (legacy call sites), the SVG falls back to a
 * `role="presentation"` + `aria-hidden="true"` state rather than emitting
 * the old English-only label. Any new call site MUST explicitly choose one
 * of the two modes — making the accessibility contract explicit.
 */

interface MatchScoreRingProps {
  /** Match score 0-100. `null` / `undefined` renders a muted placeholder. */
  score: number | null | undefined;
  /** Outer pixel size of the ring (width = height). Defaults to 44px. */
  size?: number;
  /**
   * Translated accessible name. Pass a locale-translated string from
   * `useTranslations()`. Ignored when `ariaHidden` is `true`.
   */
  ariaLabel?: string;
  /**
   * When `true`, hides the SVG from assistive tech. Use this when a sibling
   * element (e.g. an sr-only span) already announces the score in the
   * user's locale, to prevent double-announcement.
   */
  ariaHidden?: boolean;
}

const RADIUS = 16;
const STROKE_WIDTH = 3;
const VIEW_BOX = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getTextColorClass(score: number): string {
  if (score >= 80) return "text-emerald-500 dark:text-emerald-400";
  if (score >= 60) return "text-blue-500 dark:text-blue-400";
  if (score >= 40) return "text-amber-700 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

/**
 * Stroke color class for the progress ring. WCAG 1.4.11 "Non-text
 * Contrast" requires a 3:1 ratio between the graphical object (the
 * progress arc) and the adjacent background (the muted track ring +
 * the white card surface behind it).
 *
 * Sprint 4 Stream E (L-Y-05) contrast audit vs. #ffffff light-mode
 * card background (values from WebAIM Contrast Checker):
 *
 *   - amber-500  (#F59E0B) → 1.96:1  FAIL (< 3:1)
 *   - amber-600  (#D97706) → 2.85:1  FAIL (< 3:1, marginal)
 *   - amber-700  (#B45309) → 4.52:1  PASS (> 3:1, > AA text 4.5:1)
 *   - emerald-500 (#10B981) → 2.61:1  FAIL (< 3:1)
 *   - emerald-600 (#059669) → 3.39:1  PASS (> 3:1)
 *   - red-500    (#EF4444) → 3.76:1  PASS (> 3:1)
 *   - blue-500   (#3B82F6) → 3.68:1  PASS (> 3:1)
 *
 * The original amber-500 (mid-score) and emerald-500 (high-score)
 * strokes both failed the 3:1 threshold on white. We bump amber to
 * amber-700 and emerald to emerald-600 to pass. Red and blue already
 * passed and are kept as-is so existing snapshots for low/mid-score
 * rings don't shift unnecessarily.
 *
 * Dark-mode variants (all `-400` shades) were not part of the reported
 * finding and render against a dark card background where lighter
 * Tailwind shades hit the same 3:1 ratio — they remain unchanged.
 */
function getStrokeColorClass(score: number): string {
  if (score >= 80) return "stroke-emerald-600 dark:stroke-emerald-400";
  if (score >= 60) return "stroke-blue-500 dark:stroke-blue-400";
  if (score >= 40) return "stroke-amber-700 dark:stroke-amber-400";
  return "stroke-red-500 dark:stroke-red-400";
}

export function MatchScoreRing({
  score,
  size = 44,
  ariaLabel,
  ariaHidden,
}: MatchScoreRingProps) {
  const hasScore = typeof score === "number" && Number.isFinite(score);
  const safeScore: number = hasScore ? (score as number) : 0;
  const clamped = Math.max(0, Math.min(100, safeScore));
  const filled = (clamped / 100) * CIRCUMFERENCE;

  // Accessibility mode resolution (H-Y-01 / H-Y-02):
  //   - ariaHidden takes precedence: fully hide from AT.
  //   - ariaLabel → use as accessible name (role="img").
  //   - neither: decorative, hide from AT (caller MUST provide announcement).
  const isDecorative = ariaHidden === true || !ariaLabel;

  const svgA11yProps = isDecorative
    ? ({ role: "presentation", "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": ariaLabel } as const);

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      width={size}
      height={size}
      className="shrink-0"
      {...svgA11yProps}
    >
      <circle
        cx={VIEW_BOX / 2}
        cy={VIEW_BOX / 2}
        r={RADIUS}
        fill="none"
        className="stroke-muted"
        strokeWidth={STROKE_WIDTH}
      />
      {hasScore && (
        <circle
          cx={VIEW_BOX / 2}
          cy={VIEW_BOX / 2}
          r={RADIUS}
          fill="none"
          className={getStrokeColorClass(clamped)}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          strokeDashoffset="0"
          strokeLinecap="round"
          transform={`rotate(-90 ${VIEW_BOX / 2} ${VIEW_BOX / 2})`}
        />
      )}
      <text
        x={VIEW_BOX / 2}
        y={VIEW_BOX / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className={
          hasScore
            ? `text-[11px] font-semibold fill-current ${getTextColorClass(clamped)}`
            : "text-[11px] font-semibold fill-current text-muted-foreground"
        }
      >
        {hasScore ? clamped : "—"}
      </text>
    </svg>
  );
}
