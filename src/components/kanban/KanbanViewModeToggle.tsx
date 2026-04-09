"use client";

import { List, Columns3 } from "lucide-react";
import { useTranslations } from "@/i18n";
import {
  type KanbanViewMode,
  persistViewMode,
} from "@/hooks/useKanbanState";
import {
  ToolbarRadioGroup,
  type ToolbarRadioOption,
} from "@/components/ui/toolbar-radio-group";

interface KanbanViewModeToggleProps {
  value: KanbanViewMode;
  onChange: (mode: KanbanViewMode) => void;
}

/**
 * Two-option toggle for switching between Jobs table and kanban views.
 *
 * Sprint 2 Stream G (H-Y-06): migrated to the shared `ToolbarRadioGroup`
 * primitive — same CRIT-Y2 rationale as `ViewModeToggle`.
 */
export function KanbanViewModeToggle({
  value,
  onChange,
}: KanbanViewModeToggleProps) {
  const { t } = useTranslations();

  const options: ToolbarRadioOption<KanbanViewMode>[] = [
    {
      value: "table",
      label: t("jobs.kanbanViewTable"),
      icon: <List className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      value: "kanban",
      label: t("jobs.kanbanViewKanban"),
      icon: <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />,
    },
  ];

  return (
    <ToolbarRadioGroup<KanbanViewMode>
      ariaLabel={t("jobs.kanbanViewModeLabel")}
      value={value}
      onChange={(next) => {
        onChange(next);
        persistViewMode(next);
      }}
      options={options}
      activeIndicatorTestId="kanban-view-mode-active-indicator"
    />
  );
}
