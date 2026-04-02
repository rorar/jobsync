"use client";

import React, { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { useTranslations, formatDateShort } from "@/i18n";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { JobResponse } from "@/models/job.model";
import { STATUS_COLORS } from "@/hooks/useKanbanState";

// Module-level "today" — refreshed on each page load, not per-render
const getToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

interface KanbanCardProps {
  job: JobResponse;
  statusValue: string;
  isDragOverlay?: boolean;
}

export const KanbanCard = React.memo(function KanbanCard({ job, statusValue, isDragOverlay = false }: KanbanCardProps) {
  const { t, locale } = useTranslations();
  const color = STATUS_COLORS[statusValue] ?? STATUS_COLORS.draft;
  const dateKey = new Date().toISOString().slice(0, 10);
  const today = useMemo(() => getToday(), [dateKey]);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: job.id,
    disabled: isDragOverlay,
  });

  // Due date calculations
  const dueDate = job.dueDate ? new Date(job.dueDate) : null;
  const isOverdue = dueDate ? today > dueDate : false;
  const daysUntilDue = dueDate
    ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;
  const isDueToday = daysUntilDue !== null && daysUntilDue === 0;

  const tags = job.tags?.slice(0, 2) ?? [];
  const overflowCount = (job.tags?.length ?? 0) - 2;

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className={`
        group relative rounded-lg border bg-card shadow-sm
        border-l-[3px] ${color.border} ${color.darkBorder}
        hover:bg-accent/50 transition-colors
        motion-reduce:transition-none
        ${isDragOverlay ? "shadow-lg scale-[1.02] rotate-[1deg] motion-reduce:scale-100 motion-reduce:rotate-0" : ""}
        ${isDragging ? "z-50" : ""}
      `}
      role="listitem"
      data-testid="kanban-card"
    >
      <div className="flex items-start gap-2 p-3">
        {/* Drag handle */}
        <button
          type="button"
          className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing touch-none
                     text-muted-foreground/50 hover:text-muted-foreground
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                     rounded p-0.5"
          {...attributes}
          {...listeners}
          aria-label={t("jobs.kanbanDragHandle").replace("{title}", job.JobTitle?.label ?? "")}
          aria-describedby="kanban-dnd-instructions"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Card content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title */}
          <Link
            href={`/dashboard/myjobs/${job.id}`}
            className="block text-sm font-medium leading-tight truncate hover:underline
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            onClick={(e) => e.stopPropagation()}
          >
            {job.JobTitle?.label}
          </Link>

          {/* Company */}
          <p className="text-xs text-muted-foreground truncate">
            {job.Company?.label}
          </p>

          {/* Bottom row: match score + tags + due date */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Match score */}
            {job.matchScore != null && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                {t("jobs.kanbanMatchScore").replace("{score}", String(job.matchScore))}
              </Badge>
            )}

            {/* Tags */}
            {tags.map((tag) => (
              <Badge key={tag.id} variant="outline" className="text-[10px] px-1.5 py-0 h-5 max-w-[80px] truncate">
                {tag.label}
              </Badge>
            ))}
            {overflowCount > 0 && (
              <span className="text-[10px] text-muted-foreground">+{overflowCount}</span>
            )}
          </div>

          {/* Due date */}
          {dueDate && (
            <div className="text-xs">
              {isOverdue ? (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">
                  {t("jobs.kanbanOverdue")}
                </Badge>
              ) : isDueToday ? (
                <Badge className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0">
                  {t("jobs.kanbanDueToday")}
                </Badge>
              ) : isDueSoon ? (
                <Badge className="text-[10px] px-1.5 py-0 h-5 bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0">
                  {t("jobs.kanbanDueSoon").replace("{days}", String(daysUntilDue))}
                </Badge>
              ) : (
                <span className="text-muted-foreground">
                  {formatDateShort(dueDate, locale)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
