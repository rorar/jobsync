"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, formatDateShort } from "@/i18n";
import { useToast } from "@/components/ui/use-toast";
import {
  getCrmTasks,
  createCrmTask,
  startCrmTask,
  completeCrmTask,
  cancelCrmTask,
} from "@/actions/crmTask.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckSquare,
  Plus,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  User,
  Building2,
  Briefcase,
} from "lucide-react";
import { CrmTaskForm } from "@/components/crm/CrmTaskForm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CrmTask = Record<string, unknown>;
type CrmTaskStatus = "pending" | "in_progress" | "done" | "cancelled";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "default",
  in_progress: "secondary",
  done: "outline",
  cancelled: "destructive",
};

function isOverdue(task: CrmTask): boolean {
  if (!task.dueDate) return false;
  const status = task.status as string;
  if (status !== "pending" && status !== "in_progress") return false;
  return new Date(task.dueDate as string) < new Date();
}

function getTargetLabel(target: Record<string, unknown>): { icon: React.ReactNode; label: string } {
  if (target.targetPerson) {
    const p = target.targetPerson as Record<string, unknown>;
    return { icon: <User className="h-3 w-3" />, label: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() };
  }
  if (target.targetCompany) {
    const c = target.targetCompany as Record<string, unknown>;
    return { icon: <Building2 className="h-3 w-3" />, label: (c.label as string) ?? "" };
  }
  if (target.targetJob) {
    const j = target.targetJob as Record<string, unknown>;
    const title = (j.JobTitle as Record<string, unknown>)?.label as string | undefined;
    const company = (j.Company as Record<string, unknown>)?.label as string | undefined;
    return {
      icon: <Briefcase className="h-3 w-3" />,
      label: [title, company].filter(Boolean).join(" @ "),
    };
  }
  return { icon: null, label: "" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CrmTasksPageClient() {
  const { t, locale } = useTranslations();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────
  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getCrmTasks();
    if (result.success && result.data) {
      setTasks(result.data);
    } else {
      setError(result.message ? t(result.message) : t("crm.unknownError"));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // ── Actions ─────────────────────────────────────────────────────────
  async function handleCreate(input: {
    title: string;
    description?: string;
    dueDate?: string;
    targets: { targetPersonId?: string; targetCompanyId?: string; targetJobId?: string }[];
  }) {
    const result = await createCrmTask(input);
    if (result.success) {
      toast({ title: t("crm.taskCreated") });
      setDialogOpen(false);
      loadTasks();
    } else {
      toast({ title: t(result.message ?? ""), variant: "destructive" });
    }
  }

  async function handleStart(id: string) {
    setActionPending(id);
    const result = await startCrmTask(id);
    if (result.success) {
      toast({ title: t("crm.taskStarted") });
      loadTasks();
    } else {
      toast({ title: t(result.message ?? ""), variant: "destructive" });
    }
    setActionPending(null);
  }

  async function handleComplete(id: string) {
    setActionPending(id);
    const result = await completeCrmTask(id);
    if (result.success) {
      toast({ title: t("crm.taskCompleted") });
      loadTasks();
    } else {
      toast({ title: t(result.message ?? ""), variant: "destructive" });
    }
    setActionPending(null);
  }

  async function handleCancel(id: string) {
    setActionPending(id);
    const result = await cancelCrmTask(id);
    if (result.success) {
      toast({ title: t("crm.taskCancelled") });
      loadTasks();
    } else {
      toast({ title: t(result.message ?? ""), variant: "destructive" });
    }
    setActionPending(null);
  }

  // ── Derived data ────────────────────────────────────────────────────
  const grouped = {
    pending: tasks.filter((task) => (task.status as string) === "pending"),
    in_progress: tasks.filter((task) => (task.status as string) === "in_progress"),
    done: tasks.filter((task) => (task.status as string) === "done"),
  };

  // ── Render helpers ──────────────────────────────────────────────────

  function renderTaskCard(task: CrmTask) {
    const status = task.status as CrmTaskStatus;
    const targets = (task.targets ?? []) as Record<string, unknown>[];
    const overdue = isOverdue(task);

    return (
      <Card key={task.id as string} className="mb-3">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-medium leading-snug">
              {task.title as string}
            </CardTitle>
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant={STATUS_BADGE_VARIANT[status] ?? "default"}>
                {t(`crm.taskStatus.${status}`)}
              </Badge>
              {overdue && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t("crm.overdue")}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pb-3">
          {Boolean(task.description) && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {task.description as string}
            </p>
          )}

          {Boolean(task.dueDate) && (
            <p className="text-xs text-muted-foreground">
              {t("crm.dueDate")}: {formatDateShort(new Date(task.dueDate as string), locale)}
            </p>
          )}

          {targets.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {targets.map((target) => {
                const { icon, label } = getTargetLabel(target);
                if (!label) return null;
                return (
                  <span
                    key={target.id as string}
                    className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {icon}
                    {label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-1 pt-1">
            {status === "pending" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={actionPending === (task.id as string)}
                onClick={() => handleStart(task.id as string)}
              >
                <Play className="h-3 w-3" />
                {t("crm.startTask")}
              </Button>
            )}
            {(status === "pending" || status === "in_progress") && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  disabled={actionPending === (task.id as string)}
                  onClick={() => handleComplete(task.id as string)}
                >
                  <CheckCircle className="h-3 w-3" />
                  {t("crm.completeTask")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-destructive"
                  disabled={actionPending === (task.id as string)}
                  onClick={() => handleCancel(task.id as string)}
                >
                  <XCircle className="h-3 w-3" />
                  {t("crm.cancelTask")}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderEmpty() {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <CheckSquare className="h-12 w-12 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium">{t("crm.noTasks")}</p>
          <p className="text-xs text-muted-foreground">{t("crm.noTasksDescription")}</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("crm.addTask")}
        </Button>
      </div>
    );
  }

  function renderLoading() {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} label={t("crm.tasks")}>
            <div className="h-28 w-full animate-pulse rounded-lg bg-muted" />
          </Skeleton>
        ))}
      </div>
    );
  }

  function renderError() {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={loadTasks}>
          {t("crm.retry")}
        </Button>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────

  if (error) return renderError();

  return (
    <div className="col-span-3 flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold md:text-xl">{t("crm.tasks")}</h1>
        <Button size="sm" className="gap-1" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("crm.addTask")}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        renderLoading()
      ) : tasks.length === 0 ? (
        renderEmpty()
      ) : (
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="pending" className="gap-1.5">
              {t("crm.taskStatus.pending")}
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
                {grouped.pending.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="gap-1.5">
              {t("crm.taskStatus.in_progress")}
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
                {grouped.in_progress.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="done" className="gap-1.5">
              {t("crm.taskStatus.done")}
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
                {grouped.done.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {grouped.pending.length === 0 ? renderEmpty() : (
              <div className="grid gap-0 md:grid-cols-2 lg:grid-cols-3">
                {grouped.pending.map(renderTaskCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="in_progress" className="mt-4">
            {grouped.in_progress.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("crm.noTasks")}
              </p>
            ) : (
              <div className="grid gap-0 md:grid-cols-2 lg:grid-cols-3">
                {grouped.in_progress.map(renderTaskCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="done" className="mt-4">
            {grouped.done.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("crm.noTasks")}
              </p>
            ) : (
              <div className="grid gap-0 md:grid-cols-2 lg:grid-cols-3">
                {grouped.done.map(renderTaskCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Create Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crm.addTask")}</DialogTitle>
          </DialogHeader>
          <CrmTaskForm onSubmit={handleCreate} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
