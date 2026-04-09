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
 */

interface MatchScoreRingProps {
  /** Match score 0-100. `null` / `undefined` renders a muted placeholder. */
  score: number | null | undefined;
  /** Outer pixel size of the ring (width = height). Defaults to 44px. */
  size?: number;
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

function getStrokeColorClass(score: number): string {
  if (score >= 80) return "stroke-emerald-500 dark:stroke-emerald-400";
  if (score >= 60) return "stroke-blue-500 dark:stroke-blue-400";
  if (score >= 40) return "stroke-amber-500 dark:stroke-amber-400";
  return "stroke-red-500 dark:stroke-red-400";
}

export function MatchScoreRing({ score, size = 44 }: MatchScoreRingProps) {
  const hasScore = typeof score === "number" && Number.isFinite(score);
  const safeScore: number = hasScore ? (score as number) : 0;
  const clamped = Math.max(0, Math.min(100, safeScore));
  const filled = (clamped / 100) * CIRCUMFERENCE;

  const ariaLabel = hasScore
    ? `Match score ${clamped} of 100`
    : "Match score not available";

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      width={size}
      height={size}
      className="shrink-0"
      role="img"
      aria-label={ariaLabel}
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
