"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";

import { useTranslations } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { KanbanCard } from "./KanbanCard";
import { getStatusLabel } from "@/lib/crm/status-labels";
import { stageColorVar } from "@/lib/crm/stage-colors";
import type { KanbanColumn as KanbanColumnType } from "@/hooks/useKanbanState";

/** Light tint of the stage colour for column/header backgrounds. */
const STAGE_TINT = "color-mix(in srgb, var(--stage-color) 14%, transparent)";

interface KanbanColumnProps {
  column: KanbanColumnType;
  isValidDropTarget: boolean;
  isInvalidDropTarget: boolean;
  isActiveColumn: boolean;
  onToggleCollapse: (statusValue: string) => void;
}

export const KanbanColumn = React.memo(function KanbanColumn({
  column,
  isValidDropTarget,
  isInvalidDropTarget,
  isActiveColumn,
  onToggleCollapse,
}: KanbanColumnProps) {
  const { t } = useTranslations();
  const { status, jobs, isCollapsed, colour } = column;
  const stageStyle = stageColorVar(colour);

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status.value}`,
    data: { type: "column", status },
  });

  // Collapsed column pill
  if (isCollapsed) {
    return (
      <button
        type="button"
        style={{ ...stageStyle, backgroundColor: STAGE_TINT }}
        className={`
          flex items-center gap-2 rounded-lg border px-3 py-2
          text-sm font-medium
          hover:bg-accent/70 transition-colors motion-reduce:transition-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
          min-h-[44px]
        `}
        onClick={() => onToggleCollapse(status.value)}
        aria-expanded={false}
        aria-label={t("jobs.kanbanExpandColumn")}
        data-testid={`kanban-collapsed-${status.value}`}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
        <span style={{ color: "var(--stage-color)" }}>{getStatusLabel(t, status)}</span>
        <Badge variant="secondary" className="text-xs px-1.5 py-0">
          {jobs.length}
        </Badge>
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      role="group"
      style={stageStyle}
      aria-label={`${getStatusLabel(t, status)} - ${t("jobs.kanbanCollapsedCount").replace("{count}", String(jobs.length))}`}
      className={`
        flex flex-col rounded-lg border bg-muted/30 dark:bg-muted/10
        min-w-[280px] max-w-[360px] flex-1
        transition-all duration-150 motion-reduce:transition-none
        ${isValidDropTarget && isOver ? "ring-2 ring-primary bg-primary/5" : ""}
        ${isInvalidDropTarget ? "opacity-40" : ""}
        ${isActiveColumn ? "ring-1 ring-primary/50" : ""}
      `}
      data-testid={`kanban-column-${status.value}`}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 rounded-t-lg"
        style={{ backgroundColor: STAGE_TINT }}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--stage-color)" }}>
            {getStatusLabel(t, status)}
          </h3>
          <Badge variant="secondary" className="text-xs px-1.5 py-0 min-w-[20px] justify-center">
            {jobs.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={() => onToggleCollapse(status.value)}
          aria-expanded={true}
          aria-label={t("jobs.kanbanCollapseColumn")}
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Column body - scrollable card list */}
      <>
        <div
          className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-280px)] scrollbar-thin"
          role="list"
          aria-label={t("jobs.kanbanColumnJobsList").replace("{status}", getStatusLabel(t, status))}
        >
          {jobs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              {t("jobs.kanbanNoJobs")}
            </div>
          ) : (
            jobs.map((job) => (
              <KanbanCard
                key={job.id}
                job={job}
                statusValue={status.value}
                colour={colour}
              />
            ))
          )}
        </div>
      </>
    </div>
  );
});
