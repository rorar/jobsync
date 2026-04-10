"use client";

import { Minimize2, LayoutGrid, Maximize2 } from "lucide-react";
import { useTranslations } from "@/i18n";
import {
  ToolbarRadioGroup,
  type ToolbarRadioOption,
} from "@/components/ui/toolbar-radio-group";
import type { StagingLayoutSize } from "@/hooks/useStagingLayout";

interface StagingLayoutToggleProps {
  value: StagingLayoutSize;
  onChange: (size: StagingLayoutSize) => void;
}

/**
 * Three-option toggle for switching staging layout density.
 *
 * Sprint 3 Stream F (M-NEW-03): migrated from a hand-rolled radiogroup
 * to the shared `ToolbarRadioGroup` primitive. Before this migration
 * each toggle (StagingLayoutToggle, ViewModeToggle, KanbanViewModeToggle,
 * dashboard toggles) maintained its own copy of the CRIT-Y2 invariants:
 *
 *   - WCAG 1.4.1 (Use of Color) — the active option MUST have a
 *     non-color indicator (Check glyph) in addition to the background
 *     color change.
 *   - WCAG 4.1.2 (Name, Role, Value) — each radio MUST have exactly
 *     one accessible name source (aria-label), no sr-only duplicates,
 *     no title tooltip.
 *   - Roving tabindex (APG radiogroup pattern).
 *   - Arrow-key navigation with wraparound.
 *
 * Keeping those invariants in lockstep across four independent copies
 * was the definition of the CRIT-Y2 flashlight risk. ViewModeToggle
 * and KanbanViewModeToggle were migrated in Sprint 2 Stream G; this
 * migration completes the set for the staging list layout toggle.
 *
 * The primitive also owns target-size treatment (M-NEW-03 target-size
 * half): the buttons render at `px-2.5 py-1.5` (~28 tall) which
 * SATISFIES WCAG 2.5.8 AA (24x24 minimum). AAA (44x44) is NOT met
 * because growing the primitive would reflow ViewModeToggle /
 * KanbanViewModeToggle / 3 dashboard toggles — a cross-stream coordinate
 * that belongs in a follow-up sprint. Deferring the AAA fix to the
 * primitive itself guarantees all sibling toggles grow together.
 */
export function StagingLayoutToggle({ value, onChange }: StagingLayoutToggleProps) {
  const { t } = useTranslations();

  const options: ToolbarRadioOption<StagingLayoutSize>[] = [
    {
      value: "compact",
      label: t("staging.layoutSize.compact"),
      icon: <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />,
      // hideLabel keeps the existing icon-only visual. The aria-label
      // (sourced from `label`) still carries the translated option name
      // to assistive tech.
      hideLabel: true,
    },
    {
      value: "default",
      label: t("staging.layoutSize.default"),
      icon: <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />,
      hideLabel: true,
    },
    {
      value: "comfortable",
      label: t("staging.layoutSize.comfortable"),
      icon: <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />,
      hideLabel: true,
    },
  ];

  return (
    <ToolbarRadioGroup<StagingLayoutSize>
      ariaLabel={t("staging.layoutSize.label")}
      value={value}
      onChange={onChange}
      options={options}
      // The Sprint 1 CRIT-Y2 test suite queries the active-state glyph
      // by this exact testId. Preserved verbatim so existing regression
      // guards in `__tests__/StagingLayoutToggle.spec.tsx` keep passing
      // after the primitive migration.
      activeIndicatorTestId="staging-layout-active-indicator"
    />
  );
}
