/**
 * Stage colour tokens (Welle 4, F-AJ-09 / dynamic Kanban).
 *
 * Per the frozen spec, colour is PER-STAGE (category level) and is applied via a
 * CSS custom property (`--stage-color`) — NOT a per-status-value Tailwind class
 * map. This module resolves a category's seed colour NAME (a finite design token:
 * blue/indigo/purple/...) to concrete colour values. It is keyed by the colour
 * NAME, never by a status value, so user-defined statuses need no Tailwind JIT
 * class and no code change.
 *
 * Pure, dependency-free leaf (no React, no DB) so it is importable from server
 * actions, client components and the Kanban hook alike.
 *
 * Colour is never the SOLE differentiator — every column/badge/row keeps its text
 * label (WCAG 2.2 / 1.4.1). These tokens only add a recognisable hue.
 */

import type { CSSProperties } from "react";

export interface StageColorToken {
  /** Base hue (Tailwind ~500). Drives `--stage-color`. */
  base: string;
  /** Readable foreground on a light tint of the base. */
  text: string;
}

/**
 * One token per seeded stage colour name (see CATEGORY_SEED in status-categories).
 * Values are the Tailwind palette ~500/700 hexes so the Kanban keeps its previous
 * look after the move off the hardcoded per-value map.
 */
export const STAGE_COLOR_TOKENS: Record<string, StageColorToken> = {
  blue: { base: "#3b82f6", text: "#1d4ed8" },
  indigo: { base: "#6366f1", text: "#4338ca" },
  purple: { base: "#a855f7", text: "#7e22ce" },
  green: { base: "#22c55e", text: "#15803d" },
  emerald: { base: "#10b981", text: "#047857" },
  red: { base: "#ef4444", text: "#b91c1c" },
  gray: { base: "#6b7280", text: "#374151" },
  amber: { base: "#f59e0b", text: "#b45309" },
};

const FALLBACK = STAGE_COLOR_TOKENS.gray;

/** Resolve a colour NAME to its token; unknown names fall back to gray. */
export function resolveStageColor(colourName: string | null | undefined): StageColorToken {
  if (!colourName) return FALLBACK;
  return STAGE_COLOR_TOKENS[colourName] ?? FALLBACK;
}

/**
 * Inline-style object exposing the stage's base colour as the `--stage-color`
 * custom property, e.g. `style={stageColorVar(category.colour)}`. Components then
 * reference `var(--stage-color)` (optionally via `color-mix` for tints).
 */
export function stageColorVar(
  colourName: string | null | undefined,
): CSSProperties & Record<"--stage-color", string> {
  return { "--stage-color": resolveStageColor(colourName).base };
}
