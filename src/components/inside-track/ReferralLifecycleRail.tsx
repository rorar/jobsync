"use client";

/**
 * ReferralLifecycleRail — Welle 5 (Inside Track) Phase 5, Task 5.4
 *
 * Horizontal/scrollable step rail for the 7-state Referral lifecycle.
 * Purely presentational; no server calls.
 *
 * DESIGN CONTRACT (docs/design/inside-track-ui.md §D + §G item 1):
 *  - nav landmark + ol; exactly one aria-current="step"
 *  - NOT role="progressbar" (graph is branching / non-linear)
 *  - converted & declined carry sr-only "terminal"; stale carries sr-only "revivable"
 *  - colour is decorative — text label always present (WCAG 1.4.1)
 *  - overflow-x-auto on mobile; motion-reduce safe
 *
 * SoT: specs/inside-track.allium (lifecycle graph)
 */

import { useTranslations } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ReferralStatus } from "@/models/insideTrack.model";

// ---------------------------------------------------------------------------
// Canonical state order (matches forward-progress rail, left-to-right)
// ---------------------------------------------------------------------------

const RAIL_STATES: ReferralStatus[] = [
  "open",
  "engaged",
  "relayed",
  "in_review",
  "converted",
  "declined",
  "stale",
];

// ---------------------------------------------------------------------------
// Visual classes per position relative to current state
// ---------------------------------------------------------------------------

type StatePosition = "done" | "current" | "future";

function getPosition(
  stateIndex: number,
  currentIndex: number,
  status: ReferralStatus,
  state: ReferralStatus,
): StatePosition {
  // Declined and stale are lateral transitions, not forward-progress.
  // When the current status IS declined or stale, only that step is "current".
  if (state === status) return "current";
  if (status === "declined" || status === "stale") return "future";
  if (stateIndex < currentIndex) return "done";
  return "future";
}

const DOT_CLASSES: Record<StatePosition, string> = {
  done: "bg-primary border-primary text-primary-foreground",
  current:
    "bg-background border-primary ring-2 ring-primary ring-offset-2 text-primary",
  future: "bg-background border-muted-foreground/30 text-muted-foreground",
};

const LABEL_CLASSES: Record<StatePosition, string> = {
  done: "text-primary font-medium",
  current: "text-primary font-semibold",
  future: "text-muted-foreground",
};

// Special override for terminal/stale
const TERMINAL_DOT = "bg-background border-destructive ring-2 ring-destructive ring-offset-2 text-destructive";
const CONVERTED_DOT_CURRENT = "bg-primary border-primary text-primary-foreground";
const STALE_DOT_CURRENT = "bg-background border-orange-500 ring-2 ring-orange-500 ring-offset-2 text-orange-600";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ReferralLifecycleRailProps {
  status: ReferralStatus;
  className?: string;
}

export function ReferralLifecycleRail({
  status,
  className,
}: ReferralLifecycleRailProps) {
  const { t } = useTranslations();

  const currentIndex = RAIL_STATES.indexOf(status);

  return (
    <nav
      aria-label={t("insideTrack.lifecycle.railLabel")}
      className={cn("w-full", className)}
    >
      {/* overflow-x-auto for mobile — connector lines stay visible */}
      <ol className="flex items-start gap-0 overflow-x-auto pb-2">
        {RAIL_STATES.map((state, idx) => {
          const isCurrent = state === status;
          const position = getPosition(idx, currentIndex, status, state);
          const isLast = idx === RAIL_STATES.length - 1;

          // Determine dot visual class (with special terminal/stale overrides)
          let dotClass = DOT_CLASSES[position];
          if (isCurrent) {
            if (state === "converted") dotClass = CONVERTED_DOT_CURRENT;
            else if (state === "declined") dotClass = TERMINAL_DOT;
            else if (state === "stale") dotClass = STALE_DOT_CURRENT;
          }

          return (
            <li
              key={state}
              aria-current={isCurrent ? "step" : undefined}
              className="flex flex-col items-center flex-1 min-w-[4rem]"
            >
              {/* Row: connector-left + dot + connector-right */}
              <div className="flex items-center w-full">
                {/* Left connector */}
                <div
                  className={cn(
                    "h-0.5 flex-1",
                    idx === 0 ? "invisible" : "",
                    position === "done" || isCurrent
                      ? "bg-primary"
                      : "bg-muted-foreground/20",
                  )}
                  aria-hidden="true"
                />

                {/* Step dot */}
                <div
                  className={cn(
                    "relative flex items-center justify-center",
                    "h-6 w-6 shrink-0 rounded-full border-2",
                    "transition-colors motion-reduce:transition-none",
                    dotClass,
                  )}
                  aria-hidden="true"
                >
                  {/* Checkmark for done states */}
                  {position === "done" && (
                    <svg
                      viewBox="0 0 12 12"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {/* Current dot indicator */}
                  {isCurrent && position !== "done" && (
                    <span className="h-2 w-2 rounded-full bg-current" />
                  )}
                </div>

                {/* Right connector */}
                <div
                  className={cn(
                    "h-0.5 flex-1",
                    isLast ? "invisible" : "",
                    position === "done" ? "bg-primary" : "bg-muted-foreground/20",
                  )}
                  aria-hidden="true"
                />
              </div>

              {/* Label row */}
              <div className="mt-1.5 px-0.5 text-center">
                <span
                  className={cn(
                    "text-xs leading-tight whitespace-nowrap",
                    LABEL_CLASSES[position],
                  )}
                >
                  {t(`insideTrack.status.${state}`)}
                </span>

                {/* sr-only annotations (WCAG §G item 1) */}
                {(state === "converted" || state === "declined") && (
                  <span className="sr-only">
                    {" "}{t("insideTrack.lifecycle.terminalState")}
                  </span>
                )}
                {state === "stale" && (
                  <span className="sr-only">
                    {" "}{t("insideTrack.lifecycle.staleRevivable")}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
