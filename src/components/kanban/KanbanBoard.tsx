"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensors,
  useSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useTranslations } from "@/i18n";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import { KanbanEmptyState } from "./KanbanEmptyState";
import { StatusTransitionDialog } from "./StatusTransitionDialog";
import {
  useKanbanState,
  isValidTransition,
  STATUS_ORDER,
} from "@/hooks/useKanbanState";
import type { JobResponse, JobStatus } from "@/models/job.model";
import { changeJobStatus } from "@/actions/job.actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface KanbanBoardProps {
  jobs: JobResponse[];
  statuses: JobStatus[];
  onRefresh: () => void;
  loading: boolean;
}

export function KanbanBoard({ jobs, statuses, onRefresh, loading }: KanbanBoardProps) {
  const { t } = useTranslations();
  const {
    columns,
    collapsedColumns,
    toggleCollapse,
    undoState,
    setUndoWithTimeout,
    clearUndo,
    mounted,
  } = useKanbanState(jobs, statuses);

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [transitionDialog, setTransitionDialog] = useState<{
    job: JobResponse;
    fromStatus: JobStatus;
    toStatus: JobStatus;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Mobile active tab
  const [mobileTab, setMobileTab] = useState<string>(
    STATUS_ORDER.find(s => statuses.some(st => st.value === s)) ?? "draft"
  );

  // Sensor config
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  // Find job by ID
  const findJob = useCallback((id: string | null): JobResponse | undefined => {
    if (!id) return undefined;
    return jobs.find((j) => j.id === id);
  }, [jobs]);

  // Find column status by droppable ID
  const findColumnStatus = useCallback(
    (droppableId: string | null): JobStatus | undefined => {
      if (!droppableId) return undefined;
      const statusValue = droppableId.replace("column-", "");
      return statuses.find((s) => s.value === statusValue);
    },
    [statuses]
  );

  // Get the column (status value) a job is in
  const getJobColumn = useCallback(
    (jobId: string): string | undefined => {
      for (const col of columns) {
        if (col.jobs.some((j) => j.id === jobId)) {
          return col.status.value;
        }
      }
      return undefined;
    },
    [columns]
  );

  // Determine which column an "over" target belongs to
  const getTargetColumn = useCallback(
    (overId: string | null): string | undefined => {
      if (!overId) return undefined;
      // If it's a column droppable
      if (overId.startsWith("column-")) {
        return overId.replace("column-", "");
      }
      // If it's a card, find which column it's in
      return getJobColumn(overId);
    },
    [getJobColumn]
  );

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const over = event.over;
    setOverId(over ? (over.id as string) : null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setOverId(null);

      if (!over) return;

      const jobId = active.id as string;
      const job = findJob(jobId);
      if (!job) return;

      const sourceColumn = getJobColumn(jobId);
      const targetColumn = getTargetColumn(over.id as string);

      if (!sourceColumn || !targetColumn) return;

      // Same column - reorder (no-op for now, could add sort order)
      if (sourceColumn === targetColumn) return;

      // Different column - status transition
      const fromStatus = statuses.find((s) => s.value === sourceColumn);
      const toStatus = statuses.find((s) => s.value === targetColumn);

      if (!fromStatus || !toStatus) return;

      // Check transition validity
      if (!isValidTransition(sourceColumn, targetColumn)) {
        toast({
          variant: "destructive",
          title: t("jobs.kanbanInvalidTransition")
            .replace("{from}", fromStatus.label)
            .replace("{to}", toStatus.label),
        });
        return;
      }

      // Open transition dialog
      setTransitionDialog({ job, fromStatus, toStatus });
    },
    [findJob, getJobColumn, getTargetColumn, statuses, t]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverId(null);
  }, []);

  // Handle status transition confirmation
  const handleTransitionConfirm = useCallback(
    async (note?: string) => {
      if (!transitionDialog) return;

      const { job, fromStatus, toStatus } = transitionDialog;
      setIsPending(true);

      try {
        const result = await changeJobStatus(job.id, toStatus.id, note);

        if (result.success) {
          setTransitionDialog(null);

          // Set undo state
          setUndoWithTimeout({
            jobId: job.id,
            previousStatusId: fromStatus.id,
            previousStatusValue: fromStatus.value,
          });

          // Show toast with undo action
          const statusLabel = (() => {
            const key = `jobs.status${toStatus.value.charAt(0).toUpperCase()}${toStatus.value.slice(1)}`;
            const translated = t(key);
            return translated !== key ? translated : toStatus.label;
          })();

          toast({
            title: t("jobs.kanbanMoved").replace("{status}", statusLabel),
            description: job.JobTitle?.label,
            action: (
              <ToastAction
                altText={t("jobs.kanbanUndo")}
                onClick={async () => {
                  try {
                    const undoResult = await changeJobStatus(job.id, fromStatus.id);
                    if (undoResult.success) {
                      toast({ title: t("jobs.kanbanUndone") });
                      clearUndo();
                      onRefresh();
                    } else {
                      toast({ variant: "destructive", title: t("jobs.kanbanUndoFailed") });
                    }
                  } catch {
                    toast({ variant: "destructive", title: t("jobs.kanbanUndoFailed") });
                  }
                }}
              >
                {t("jobs.kanbanUndo")}
              </ToastAction>
            ),
            duration: 5000,
          });

          onRefresh();
        } else {
          toast({
            variant: "destructive",
            title: t("jobs.kanbanMoveFailed"),
            description: result.message,
          });
        }
      } catch {
        toast({
          variant: "destructive",
          title: t("jobs.kanbanMoveFailed"),
        });
      }

      setIsPending(false);
    },
    [transitionDialog, t, onRefresh, setUndoWithTimeout, clearUndo]
  );

  const handleTransitionCancel = useCallback(() => {
    setTransitionDialog(null);
  }, []);

  // Mobile status change handler
  const handleMobileStatusChange = useCallback(
    (job: JobResponse, newStatusValue: string) => {
      const fromStatus = job.Status;
      const toStatus = statuses.find((s) => s.value === newStatusValue);
      if (!fromStatus || !toStatus) return;

      if (!isValidTransition(fromStatus.value, newStatusValue)) {
        toast({
          variant: "destructive",
          title: t("jobs.kanbanInvalidTransition")
            .replace("{from}", fromStatus.label)
            .replace("{to}", toStatus.label),
        });
        return;
      }

      setTransitionDialog({ job, fromStatus, toStatus });
    },
    [statuses, t]
  );

  // Active card for drag overlay
  const activeJob = findJob(activeId);
  const activeJobColumn = activeId ? getJobColumn(activeId) : undefined;

  // Determine valid/invalid drop targets based on active card
  const activeSourceStatus = activeJobColumn ?? "";

  // Expanded and collapsed columns
  const expandedColumns = columns.filter((c) => !c.isCollapsed);
  const collapsedColumnList = columns.filter((c) => c.isCollapsed);

  // Loading skeleton
  if (loading && jobs.length === 0) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4" data-testid="kanban-skeleton">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col rounded-lg border bg-muted/30 min-w-[280px] max-w-[360px] flex-1">
            <div className="px-3 py-2.5 rounded-t-lg bg-muted/50">
              <div className="h-5 w-20 animate-pulse motion-reduce:animate-none rounded bg-muted" />
            </div>
            <div className="p-2 space-y-2">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-20 animate-pulse motion-reduce:animate-none rounded-lg bg-muted/50" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (jobs.length === 0 && !loading) {
    return <KanbanEmptyState />;
  }

  // Build columns for mobile tabs
  const mobileColumns = columns.filter(c => statuses.some(s => s.value === c.status.value));
  const visibleMobileTabs = mobileColumns.filter(c => !c.isCollapsed);
  const collapsedMobileTabs = mobileColumns.filter(c => c.isCollapsed);

  const getStatusLabel = (status: JobStatus) => {
    const key = `jobs.status${status.value.charAt(0).toUpperCase()}${status.value.slice(1)}`;
    const translated = t(key);
    return translated !== key ? translated : status.label;
  };

  return (
    <>
      {/* Desktop Kanban Board */}
      <div
        className="hidden md:block"
        role="region"
        aria-label={t("jobs.kanbanBoard")}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          accessibility={{
            announcements: {
              onDragStart({ active }) {
                const job = findJob(active.id as string);
                const col = getJobColumn(active.id as string);
                const colStatus = statuses.find(s => s.value === col);
                return t("jobs.kanbanDragStart")
                  .replace("{title}", job?.JobTitle?.label ?? "")
                  .replace("{status}", colStatus?.label ?? "");
              },
              onDragOver({ active, over }) {
                if (!over) return "";
                const job = findJob(active.id as string);
                const targetCol = getTargetColumn(over.id as string);
                const targetStatus = statuses.find(s => s.value === targetCol);
                return t("jobs.kanbanDragOver")
                  .replace("{status}", targetStatus?.label ?? "");
              },
              onDragEnd({ active, over }) {
                const job = findJob(active.id as string);
                if (over) {
                  const targetCol = getTargetColumn(over.id as string);
                  const targetStatus = statuses.find(s => s.value === targetCol);
                  return t("jobs.kanbanDragEnd")
                    .replace("{title}", job?.JobTitle?.label ?? "")
                    .replace("{status}", targetStatus?.label ?? "");
                }
                return t("jobs.kanbanDragCancel")
                  .replace("{title}", job?.JobTitle?.label ?? "");
              },
              onDragCancel({ active }) {
                const job = findJob(active.id as string);
                return t("jobs.kanbanDragCancel")
                  .replace("{title}", job?.JobTitle?.label ?? "");
              },
            },
          }}
        >
          {/* DnD instructions for screen readers */}
          <div id="kanban-dnd-instructions" className="sr-only">
            {t("jobs.kanbanDndInstructions")}
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4">
            {expandedColumns.map((column) => (
              <KanbanColumn
                key={column.status.value}
                column={column}
                isValidDropTarget={
                  activeId !== null &&
                  isValidTransition(activeSourceStatus, column.status.value) &&
                  column.status.value !== activeSourceStatus
                }
                isInvalidDropTarget={
                  activeId !== null &&
                  !isValidTransition(activeSourceStatus, column.status.value) &&
                  column.status.value !== activeSourceStatus
                }
                isActiveColumn={column.status.value === activeSourceStatus && activeId !== null}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </div>

          {/* Collapsed column pills */}
          {collapsedColumnList.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {collapsedColumnList.map((column) => (
                <KanbanColumn
                  key={column.status.value}
                  column={column}
                  isValidDropTarget={false}
                  isInvalidDropTarget={false}
                  isActiveColumn={false}
                  onToggleCollapse={toggleCollapse}
                />
              ))}
            </div>
          )}

          {/* Drag overlay */}
          <DragOverlay>
            {activeJob && activeJobColumn ? (
              <KanbanCard
                job={activeJob}
                statusValue={activeJobColumn}
                isDragOverlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Mobile Tab View */}
      <div className="md:hidden">
        <Tabs value={mobileTab} onValueChange={setMobileTab}>
          <div className="overflow-x-auto -mx-2 px-2">
            <TabsList className="w-max">
              {visibleMobileTabs.map((column) => (
                <TabsTrigger key={column.status.value} value={column.status.value}>
                  {getStatusLabel(column.status)}
                  <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0 min-w-[20px] justify-center">
                    {column.jobs.length}
                  </Badge>
                </TabsTrigger>
              ))}
              {collapsedMobileTabs.map((column) => (
                <TabsTrigger key={column.status.value} value={column.status.value} className="text-muted-foreground">
                  {getStatusLabel(column.status)}
                  <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0 min-w-[20px] justify-center">
                    {column.jobs.length}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {mobileColumns.map((column) => (
            <TabsContent key={column.status.value} value={column.status.value}>
              <div className="space-y-2 mt-2">
                {column.jobs.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    {t("jobs.kanbanNoJobs")}
                  </div>
                ) : (
                  column.jobs.map((job) => (
                    <div key={job.id} className="space-y-1">
                      <KanbanCard job={job} statusValue={column.status.value} />
                      {/* Mobile status change dropdown */}
                      <div className="pl-8">
                        <Select
                          value={job.Status?.value}
                          onValueChange={(val) => handleMobileStatusChange(job, val)}
                        >
                          <SelectTrigger className="h-7 text-xs w-auto max-w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statuses
                              .filter((s) =>
                                s.value === job.Status?.value ||
                                isValidTransition(job.Status?.value ?? "", s.value)
                              )
                              .map((s) => (
                                <SelectItem
                                  key={s.id}
                                  value={s.value}
                                  disabled={s.value === job.Status?.value}
                                >
                                  {getStatusLabel(s)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Transition Dialog */}
      <StatusTransitionDialog
        open={!!transitionDialog}
        job={transitionDialog?.job ?? null}
        fromStatus={transitionDialog?.fromStatus ?? null}
        toStatus={transitionDialog?.toStatus ?? null}
        onConfirm={handleTransitionConfirm}
        onCancel={handleTransitionCancel}
        isPending={isPending}
      />
    </>
  );
}
