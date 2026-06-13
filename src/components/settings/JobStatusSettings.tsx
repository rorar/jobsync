"use client";

/**
 * Job-Status management UI (Welle 4, F-AJ-09, Phase 2.4).
 *
 * Settings → "Statuses". Lists the user's statuses grouped by stage (category),
 * with create / rename / move-stage / reorder (drag + up/down keyboard fallback)
 * / set-default / delete. Delete-in-use opens a "move N jobs and delete" reassign
 * dialog; the default and last status cannot be deleted (disabled + tooltip).
 * Moving a status into an applied stage shows an impact warning first.
 *
 * Colour is per-stage via the `--stage-color` CSS custom property (stage-colors.ts),
 * never a per-status Tailwind map. Card/list pattern mirrors CompanyBlacklistSettings.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useTranslations } from "@/i18n";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { toast } from "../ui/use-toast";
import {
  getJobStatuses,
  getJobStatusCategories,
  createJobStatus,
  renameJobStatus,
  reorderJobStatuses,
  setDefaultJobStatus,
  deleteJobStatus,
  type JobStatusView,
  type JobStatusCategoryView,
} from "@/actions/jobStatus.actions";
import { stageColorVar } from "@/lib/crm/stage-colors";

const SOFT_CAP = 12;

/** Decorative stage colour dot — colour is never the sole differentiator. */
function StageDot({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ ...stageColorVar(colour), backgroundColor: "var(--stage-color)" }}
    />
  );
}

interface RowProps {
  status: JobStatusView;
  index: number;
  count: number;
  totalStatuses: number;
  onMove: (status: JobStatusView, toIndex: number) => void;
  onSetDefault: (status: JobStatusView) => void;
  onEdit: (status: JobStatusView) => void;
  onDelete: (status: JobStatusView) => void;
}

function SortableStatusRow({
  status,
  index,
  count,
  totalStatuses,
  onMove,
  onSetDefault,
  onEdit,
  onDelete,
}: RowProps) {
  const { t } = useTranslations();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: status.id });

  const deleteBlockedReason = status.isDefault
    ? t("jobStatus.cannotDeleteDefault")
    : totalStatuses <= 1
      ? t("jobStatus.cannotDeleteLast")
      : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg border bg-card px-2 py-2 ${
        isDragging ? "opacity-60 z-10" : ""
      }`}
      data-testid={`status-row-${status.value}`}
    >
      <button
        type="button"
        className="flex h-11 w-11 -my-1 shrink-0 cursor-grab touch-none items-center justify-center rounded
                   text-muted-foreground/50 hover:text-muted-foreground
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        aria-label={t("jobStatus.dragHandle").replace("{label}", status.label)}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      <StageDot colour={status.category.colour} />

      <span className="min-w-0 flex-1 truncate text-sm font-medium">{status.label}</span>

      {status.jobCount > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {t("jobStatus.jobCount").replace("{count}", String(status.jobCount))}
        </span>
      )}

      {status.isDefault && (
        <Badge variant="secondary" className="shrink-0">
          {t("jobStatus.default")}
        </Badge>
      )}

      {/* Reorder up/down (keyboard fallback for DnD) */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        disabled={index === 0}
        onClick={() => onMove(status, index - 1)}
        aria-label={t("jobStatus.moveUp")}
        data-testid={`status-up-${status.value}`}
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        disabled={index === count - 1}
        onClick={() => onMove(status, index + 1)}
        aria-label={t("jobStatus.moveDown")}
        data-testid={`status-down-${status.value}`}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>

      {!status.isDefault && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onSetDefault(status)}
          aria-label={t("jobStatus.setDefault")}
          data-testid={`status-default-${status.value}`}
        >
          <Star className="h-4 w-4" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => onEdit(status)}
        aria-label={t("jobStatus.editStatus").replace("{label}", status.label)}
        data-testid={`status-edit-${status.value}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>

      {deleteBlockedReason ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span wrapper so the tooltip still fires on a disabled button */}
              <span className="inline-flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground"
                  disabled
                  aria-label={t("jobStatus.deleteStatus").replace("{label}", status.label)}
                  data-testid={`status-delete-${status.value}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{deleteBlockedReason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
          onClick={() => onDelete(status)}
          aria-label={t("jobStatus.deleteStatus").replace("{label}", status.label)}
          data-testid={`status-delete-${status.value}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default function JobStatusSettings() {
  const { t } = useTranslations();
  const [statuses, setStatuses] = useState<JobStatusView[]>([]);
  const [categories, setCategories] = useState<JobStatusCategoryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [announce, setAnnounce] = useState("");

  // Add form
  const [newLabel, setNewLabel] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [adding, setAdding] = useState(false);

  // Dialogs
  const [editTarget, setEditTarget] = useState<JobStatusView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobStatusView | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const [sRes, cRes] = await Promise.all([getJobStatuses(), getJobStatusCategories()]);
    if (sRes.success && sRes.data && cRes.success && cRes.data) {
      setStatuses(sRes.data);
      setCategories(cRes.data);
      if (!newCategoryId && cRes.data.length > 0) setNewCategoryId(cRes.data[0].id);
    } else {
      setError(true);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusesByCategory = useMemo(() => {
    const map = new Map<string, JobStatusView[]>();
    for (const c of categories) map.set(c.id, []);
    for (const s of statuses) {
      const arr = map.get(s.category.id) ?? [];
      arr.push(s);
      map.set(s.category.id, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [statuses, categories]);

  const stageLabel = useCallback(
    (cat: JobStatusCategoryView) => t(`jobStatus.stage.${cat.kind}` as never) || cat.label,
    [t],
  );

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label || !newCategoryId) return;
    setAdding(true);
    const res = await createJobStatus(newCategoryId, label);
    setAdding(false);
    if (res.success) {
      setNewLabel("");
      setAnnounce(t("jobStatus.created"));
      toast({ variant: "success", description: t("jobStatus.created") });
      load();
    } else {
      toast({ variant: "destructive", description: t(res.message ?? "errors.createFailed") });
    }
  }

  const handleMove = useCallback(
    async (status: JobStatusView, toIndex: number) => {
      const siblings = statusesByCategory.get(status.category.id) ?? [];
      const fromIndex = siblings.findIndex((s) => s.id === status.id);
      if (fromIndex === -1 || toIndex < 0 || toIndex >= siblings.length || toIndex === fromIndex) {
        return;
      }
      // Renormalize the whole stage to contiguous 0..N-1 in the new order — no
      // fractional midpoints, so positions can never drift toward colliding.
      const ids = siblings.map((s) => s.id);
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      const res = await reorderJobStatuses(ids);
      if (res.success) {
        setAnnounce(t("jobStatus.reordered"));
        load();
      } else {
        toast({ variant: "destructive", description: t(res.message ?? "errors.updateFailed") });
      }
    },
    [statusesByCategory, load, t],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const status = statuses.find((s) => s.id === active.id);
      const overStatus = statuses.find((s) => s.id === over.id);
      // Reorder only within the same stage (cross-stage = explicit Edit dialog).
      if (!status || !overStatus || status.category.id !== overStatus.category.id) return;
      const siblings = statusesByCategory.get(status.category.id) ?? [];
      handleMove(status, siblings.findIndex((s) => s.id === overStatus.id));
    },
    [statuses, statusesByCategory, handleMove],
  );

  async function handleSetDefault(status: JobStatusView) {
    const res = await setDefaultJobStatus(status.id);
    if (res.success) {
      setAnnounce(t("jobStatus.defaultSet"));
      toast({ variant: "success", description: t("jobStatus.defaultSet") });
      load();
    } else {
      toast({ variant: "destructive", description: t(res.message ?? "errors.updateFailed") });
    }
  }

  const overSoftCap = statuses.length > SOFT_CAP;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("jobStatus.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("jobStatus.description")}</p>
      </div>

      {overSoftCap && (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800
                     dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          role="status"
          data-testid="soft-cap-warning"
        >
          {t("jobStatus.softCapWarning")
            .replace("{count}", String(statuses.length))
            .replace("{max}", String(SOFT_CAP))}
        </div>
      )}

      {/* Add status */}
      <div className="rounded-lg border p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="new-status-label">{t("jobStatus.statusName")}</Label>
            <Input
              id="new-status-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("jobStatus.statusNamePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-status-stage">{t("jobStatus.stage")}</Label>
            <Select value={newCategoryId} onValueChange={setNewCategoryId}>
              <SelectTrigger id="new-status-stage" className="w-full sm:w-[170px]">
                <SelectValue placeholder={t("jobStatus.selectStage")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {stageLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAdd}
            disabled={adding || !newLabel.trim() || !newCategoryId}
            className="gap-1.5"
            data-testid="add-status-btn"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("jobStatus.addStatus")}
          </Button>
        </div>
      </div>

      {/* Grouped list */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {t("common.loading")}
        </div>
      ) : error ? (
        <div className="py-8 text-center">
          <p className="text-destructive">{t("jobStatus.loadFailed")}</p>
          <Button variant="outline" size="sm" onClick={load} className="mt-2">
            {t("jobStatus.retry")}
          </Button>
        </div>
      ) : statuses.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <ListChecks className="mx-auto mb-3 h-10 w-10 opacity-30" aria-hidden="true" />
          <p className="font-medium">{t("jobStatus.empty")}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="space-y-5">
            {categories.map((cat) => {
              const stageStatuses = statusesByCategory.get(cat.id) ?? [];
              return (
                <section key={cat.id} aria-label={stageLabel(cat)}>
                  <div className="mb-2 flex items-center gap-2">
                    <StageDot colour={cat.colour} />
                    <h4 className="text-sm font-semibold">{stageLabel(cat)}</h4>
                    {cat.isAppliedStage && (
                      <Badge variant="outline" className="text-[10px]">
                        {t("jobStatus.marksApplied")}
                      </Badge>
                    )}
                  </div>
                  {stageStatuses.length === 0 ? (
                    <p className="pl-4 text-xs text-muted-foreground">
                      {t("jobStatus.noStatusesInStage")}
                    </p>
                  ) : (
                    <SortableContext
                      items={stageStatuses.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-1.5">
                        {stageStatuses.map((s, i) => (
                          <SortableStatusRow
                            key={s.id}
                            status={s}
                            index={i}
                            count={stageStatuses.length}
                            totalStatuses={statuses.length}
                            onMove={handleMove}
                            onSetDefault={handleSetDefault}
                            onEdit={setEditTarget}
                            onDelete={setDeleteTarget}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  )}
                </section>
              );
            })}
          </div>
        </DndContext>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>

      {editTarget && (
        <EditStatusDialog
          status={editTarget}
          categories={categories}
          stageLabel={stageLabel}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            setAnnounce(t("jobStatus.renamed"));
            load();
          }}
        />
      )}

      {deleteTarget && (
        <DeleteStatusDialog
          status={deleteTarget}
          allStatuses={statuses}
          stageLabel={stageLabel}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            setAnnounce(t("jobStatus.deleted"));
            load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog (rename + move stage, with applied-impact warning)
// ---------------------------------------------------------------------------

interface EditDialogProps {
  status: JobStatusView;
  categories: JobStatusCategoryView[];
  stageLabel: (c: JobStatusCategoryView) => string;
  onClose: () => void;
  onSaved: () => void;
}

function EditStatusDialog({ status, categories, stageLabel, onClose, onSaved }: EditDialogProps) {
  const { t } = useTranslations();
  const [label, setLabel] = useState(status.label);
  const [categoryId, setCategoryId] = useState(status.category.id);
  const [saving, setSaving] = useState(false);

  const targetCategory = categories.find((c) => c.id === categoryId);
  // Impact: moving INTO an applied stage from a non-applied stage marks jobs.
  const showImpact =
    !!targetCategory &&
    targetCategory.isAppliedStage &&
    !status.category.isAppliedStage &&
    status.jobCount > 0;

  async function handleSave() {
    if (!label.trim()) return;
    setSaving(true);
    const res = await renameJobStatus(status.id, label.trim(), categoryId);
    setSaving(false);
    if (res.success) {
      toast({ variant: "success", description: t("jobStatus.renamed") });
      onSaved();
    } else {
      toast({ variant: "destructive", description: t(res.message ?? "errors.updateFailed") });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("jobStatus.editTitle")}</DialogTitle>
          <DialogDescription>{t("jobStatus.editDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-status-label">{t("jobStatus.statusName")}</Label>
            <Input
              id="edit-status-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status-stage">{t("jobStatus.stage")}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="edit-status-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {stageLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showImpact && targetCategory && (
            <div
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800
                         dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              role="status"
              data-testid="impact-warning"
            >
              {t("jobStatus.impactWarning")
                .replace("{label}", status.label)
                .replace("{stage}", stageLabel(targetCategory))
                .replace("{count}", String(status.jobCount))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !label.trim()} data-testid="edit-save-btn">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete dialog (simple confirm OR move-and-delete reassign)
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  status: JobStatusView;
  allStatuses: JobStatusView[];
  stageLabel: (c: JobStatusCategoryView) => string;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteStatusDialog({ status, allStatuses, stageLabel, onClose, onDeleted }: DeleteDialogProps) {
  const { t } = useTranslations();
  const [reassignTo, setReassignTo] = useState("");
  const [deleting, setDeleting] = useState(false);

  const inUse = status.jobCount > 0;
  const reassignTargets = allStatuses.filter((s) => s.id !== status.id);

  async function handleDelete() {
    if (inUse && !reassignTo) return;
    setDeleting(true);
    const res = await deleteJobStatus(status.id, inUse ? reassignTo : undefined);
    setDeleting(false);
    if (res.success) {
      toast({ variant: "success", description: t("jobStatus.deleted") });
      onDeleted();
    } else {
      toast({ variant: "destructive", description: t(res.message ?? "errors.deleteFailed") });
    }
  }

  // Not-in-use → simple AlertDialog confirm.
  if (!inUse) {
    return (
      <AlertDialog open onOpenChange={(o) => !o && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("jobStatus.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("jobStatus.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} data-testid="delete-confirm-btn">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // In-use → move-and-delete reassign dialog.
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("jobStatus.deleteInUseTitle")}</DialogTitle>
          <DialogDescription>
            {t("jobStatus.deleteInUseDescription")
              .replace("{label}", status.label)
              .replace("{count}", String(status.jobCount))}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reassign-target">{t("jobStatus.reassignTo")}</Label>
          <Select value={reassignTo} onValueChange={setReassignTo}>
            <SelectTrigger id="reassign-target" data-testid="reassign-select">
              <SelectValue placeholder={t("jobStatus.selectReassign")} />
            </SelectTrigger>
            <SelectContent>
              {reassignTargets.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {stageLabel(s.category)} · {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || !reassignTo}
            data-testid="move-and-delete-btn"
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}
            {t("jobStatus.moveAndDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
