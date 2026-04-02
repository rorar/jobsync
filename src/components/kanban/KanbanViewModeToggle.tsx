"use client";

import { useRef } from "react";
import { List, Columns3 } from "lucide-react";
import { useTranslations } from "@/i18n";
import {
  type KanbanViewMode,
  persistViewMode,
} from "@/hooks/useKanbanState";

interface KanbanViewModeToggleProps {
  value: KanbanViewMode;
  onChange: (mode: KanbanViewMode) => void;
}

export function KanbanViewModeToggle({ value, onChange }: KanbanViewModeToggleProps) {
  const { t } = useTranslations();
  const tableRef = useRef<HTMLButtonElement>(null);
  const kanbanRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown"
    ) {
      e.preventDefault();
      const newValue: KanbanViewMode = value === "table" ? "kanban" : "table";
      onChange(newValue);
      persistViewMode(newValue);
      if (newValue === "table") tableRef.current?.focus();
      else kanbanRef.current?.focus();
    }
  };

  return (
    <div
      className="inline-flex items-center rounded-md border border-input bg-background p-0.5"
      role="radiogroup"
      aria-label={t("jobs.kanbanViewModeLabel")}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={tableRef}
        type="button"
        role="radio"
        aria-checked={value === "table"}
        tabIndex={value === "table" ? 0 : -1}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          value === "table"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        onClick={() => {
          onChange("table");
          persistViewMode("table");
        }}
      >
        <List className="h-3.5 w-3.5" aria-hidden="true" />
        {t("jobs.kanbanViewTable")}
      </button>
      <button
        ref={kanbanRef}
        type="button"
        role="radio"
        aria-checked={value === "kanban"}
        tabIndex={value === "kanban" ? 0 : -1}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          value === "kanban"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        onClick={() => {
          onChange("kanban");
          persistViewMode("kanban");
        }}
      >
        <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
        {t("jobs.kanbanViewKanban")}
      </button>
    </div>
  );
}
