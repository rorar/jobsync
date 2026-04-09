"use client";

import { List, Layers } from "lucide-react";
import { useTranslations } from "@/i18n";
import {
  ToolbarRadioGroup,
  type ToolbarRadioOption,
} from "@/components/ui/toolbar-radio-group";

export type ViewMode = "list" | "deck";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const STORAGE_KEY = "jobsync-staging-view-mode";

export function getPersistedViewMode(): ViewMode {
  if (typeof window === "undefined") return "list";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "deck" ? "deck" : "list";
}

export function persistViewMode(mode: ViewMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
}

/**
 * Two-option toggle for switching between staging list and deck views.
 *
 * Sprint 2 Stream G (H-Y-06): migrated to the shared `ToolbarRadioGroup`
 * primitive to propagate the CRIT-Y2 non-color indicator (Check glyph)
 * and prevent further drift between sibling toggles.
 */
export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  const { t } = useTranslations();

  const options: ToolbarRadioOption<ViewMode>[] = [
    {
      value: "list",
      label: t("deck.viewModeList"),
      icon: <List className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      value: "deck",
      label: t("deck.viewModeDeck"),
      icon: <Layers className="h-3.5 w-3.5" aria-hidden="true" />,
    },
  ];

  return (
    <ToolbarRadioGroup<ViewMode>
      ariaLabel={t("deck.viewModeLabel")}
      value={value}
      onChange={(next) => {
        onChange(next);
        persistViewMode(next);
      }}
      options={options}
      activeIndicatorTestId="staging-view-mode-active-indicator"
    />
  );
}
