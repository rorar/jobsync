"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ToolbarRadioGroup
 *
 * Shared accessible primitive for a small segmented-button toolbar that
 * represents a single-choice selection (view mode, layout size, time
 * period, active tab...).
 *
 * Extracted during Sprint 2 Stream G (H-Y-06 / H-Y-07) to stop the
 * CRIT-Y2 flashlight effect: every new toggle was reinventing the same
 * `role="radiogroup"` / `role="radio"` / `aria-checked` pattern locally
 * and forgetting the WCAG 1.4.1 non-color indicator every time.
 *
 * Accessibility contract (audited against WCAG 2.2 AA):
 *
 *   1. The wrapper renders `role="radiogroup"` and carries the
 *      caller-provided `ariaLabel` so assistive tech announces the
 *      group purpose (e.g. "View mode").
 *   2. Each option renders a real `<button type="button">` with
 *      `role="radio"` and `aria-checked`. `aria-label` carries the
 *      option's translated label — callers MUST pass a translated
 *      string for every option.
 *   3. Roving `tabIndex` — only the currently selected option is in
 *      the tab order (tabIndex 0). Tabbing into the group lands on
 *      the active option; Arrow keys move selection.
 *   4. Arrow-key navigation: Left/Up → previous, Right/Down → next,
 *      wrapping at both ends. Selection moves AND focus moves to the
 *      newly selected option (APG roving tabindex pattern).
 *   5. Active-state visual cue (WCAG 1.4.1 Use of Color): the selected
 *      option renders a small `Check` glyph overlaid in the top-right
 *      corner IN ADDITION to the background color change. The glyph
 *      is `aria-hidden="true"` because `aria-checked` already conveys
 *      the state to AT.
 *
 * Non-goals (kept intentionally out of scope):
 *   - Persistence (localStorage / cookies). Callers own that — a
 *     radio group is a state-lift primitive.
 *   - Controlled/uncontrolled hybrid. Controlled only: pass `value`
 *     and `onChange`, caller owns state.
 *   - Horizontal / vertical layout switching. Always horizontal.
 */

export interface ToolbarRadioOption<V extends string> {
  /** Stable value identifier. */
  value: V;
  /**
   * Translated accessible name. Callers MUST pass a localized string
   * from `useTranslations()` — never a hardcoded English string.
   */
  label: string;
  /**
   * Optional visual content. If omitted, the option renders the label
   * as visible text. Use this to render an icon + label, or an
   * icon-only button (in which case the label becomes the a11y name
   * only).
   */
  icon?: React.ReactNode;
  /**
   * When `true` the visible label is suppressed — the option renders
   * only the icon, but the aria-label still announces the translated
   * label to screen readers. Defaults to `false`.
   */
  hideLabel?: boolean;
  /**
   * Optional `data-testid` forwarded to the option button. Useful for
   * dashboard-style toggles that want to query individual items in
   * tests without relying on accessible name parsing.
   */
  testId?: string;
}

export interface ToolbarRadioGroupProps<V extends string> {
  /** Translated accessible name for the radio group (e.g. "View mode"). */
  ariaLabel: string;
  /** Currently selected value. */
  value: V;
  /** Callback fired when the user selects a new value. */
  onChange: (next: V) => void;
  /** Ordered list of options. 2+ entries expected. */
  options: ToolbarRadioOption<V>[];
  /**
   * Optional `data-testid` to query the single active-state Check glyph
   * across the group. Default: `toolbar-radio-active-indicator`. Unique
   * per instance if you render multiple toolbars in the same view.
   */
  activeIndicatorTestId?: string;
  /** Optional class names merged onto the wrapper `<div>`. */
  className?: string;
}

export function ToolbarRadioGroup<V extends string>({
  ariaLabel,
  value,
  onChange,
  options,
  activeIndicatorTestId = "toolbar-radio-active-indicator",
  className,
}: ToolbarRadioGroupProps<V>) {
  // Button refs — keyed by value so focus management is stable across renders.
  const buttonRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const focusValue = React.useCallback((next: V) => {
    buttonRefs.current[next]?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight" &&
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown"
    ) {
      return;
    }
    e.preventDefault();
    const currentIndex = options.findIndex((o) => o.value === value);
    if (currentIndex === -1) return;
    const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    const nextIndex =
      (currentIndex + delta + options.length) % options.length;
    const nextValue = options[nextIndex].value;
    onChange(nextValue);
    // Defer focus to next tick so that the rerender with new tabIndex
    // values has landed before we move the caret (roving tabindex APG).
    queueMicrotask(() => focusValue(nextValue));
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex items-center rounded-md border border-input bg-background p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[option.value] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            tabIndex={active ? 0 : -1}
            data-testid={option.testId}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            {option.icon}
            {!option.hideLabel && <span>{option.label}</span>}
            {active && (
              <Check
                className="pointer-events-none absolute right-0.5 top-0.5 h-2.5 w-2.5 stroke-[3]"
                aria-hidden="true"
                data-testid={activeIndicatorTestId}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
