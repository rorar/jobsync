"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, formatDateShort } from "@/i18n";
import { useToast } from "@/components/ui/use-toast";
import {
  getInterviews,
  scheduleInterview,
  completeInterview,
  cancelInterview,
  rescheduleInterview,
} from "@/actions/crmInterview.actions";
import type { InterviewOutcome } from "@/models/person.model";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  Plus,
  MoreHorizontal,
  MapPin,
  Building2,
  Briefcase,
  User,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import InterviewForm from "@/components/crm/InterviewForm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Interview = Record<string, unknown>;

type ScheduleInput = {
  jobId: string;
  interviewDate: string;
  location?: string;
  notes?: string;
  personId?: string;
};

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  scheduled: "default",
  completed: "outline",
  cancelled: "destructive",
  rescheduled: "secondary",
};

const OUTCOME_CLASSES: Record<string, string> = {
  passed: "border-transparent bg-green-600 text-white hover:bg-green-600/80",
  rejected: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
  waitlisted: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  pending: "text-foreground",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InterviewsPageClient() {
  const { t, locale } = useTranslations();
  const { toast } = useToast();

  const [upcoming, setUpcoming] = useState<Interview[]>([]);
  const [past, setPast] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reschedule state
  const [rescheduleTarget, setRescheduleTarget] = useState<Interview | null>(null);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);

  // Complete state
  const [completeTarget, setCompleteTarget] = useState<Interview | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<InterviewOutcome>("passed");
  const [outcomeNotes, setOutcomeNotes] = useState("");

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const loadInterviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [upRes, allRes] = await Promise.all([
        getInterviews({ upcoming: true }),
        getInterviews(),
      ]);

      if (upRes.success && upRes.data) {
        setUpcoming(upRes.data);
      }

      if (allRes.success && allRes.data) {
        const upcomingIds = new Set(
          (upRes.success && upRes.data ? upRes.data : []).map((i) => i.id as string),
        );
        setPast(allRes.data.filter((i) => !upcomingIds.has(i.id as string)));
      }
    } catch {
      setError("Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInterviews();
  }, [loadInterviews]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleSchedule = async (input: ScheduleInput) => {
    setSubmitting(true);
    const result = await scheduleInterview({
      jobId: input.jobId,
      interviewDate: input.interviewDate,
      location: input.location || null,
      notes: input.notes || null,
      personId: input.personId || null,
    });
    setSubmitting(false);

    if (result.success) {
      toast({ title: t("crm.interviewScheduled") });
      setDialogOpen(false);
      loadInterviews();
    } else {
      toast({ title: result.message ? t(result.message) : "Error", variant: "destructive" });
    }
  };

  const handleCancel = async (id: string) => {
    const result = await cancelInterview(id);
    if (result.success) {
      toast({ title: t("crm.interviewCancelled") });
      loadInterviews();
    } else {
      toast({ title: result.message ? t(result.message) : "Error", variant: "destructive" });
    }
  };

  const handleComplete = async () => {
    if (!completeTarget) return;
    setSubmitting(true);
    const result = await completeInterview(
      completeTarget.id as string,
      selectedOutcome,
      outcomeNotes || null,
    );
    setSubmitting(false);

    if (result.success) {
      toast({ title: t("crm.interviewCompleted") });
      setCompleteDialogOpen(false);
      setCompleteTarget(null);
      setSelectedOutcome("passed");
      setOutcomeNotes("");
      loadInterviews();
    } else {
      toast({ title: result.message ? t(result.message) : "Error", variant: "destructive" });
    }
  };

  const handleReschedule = async (input: ScheduleInput) => {
    if (!rescheduleTarget) return;
    setSubmitting(true);
    const result = await rescheduleInterview(
      rescheduleTarget.id as string,
      input.interviewDate,
      input.location || null,
    );
    setSubmitting(false);

    if (result.success) {
      toast({ title: t("crm.interviewRescheduled") });
      setRescheduleDialogOpen(false);
      setRescheduleTarget(null);
      loadInterviews();
    } else {
      toast({ title: result.message ? t(result.message) : "Error", variant: "destructive" });
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const getJobTitle = (interview: Interview): string => {
    const job = interview.job as Record<string, unknown> | null;
    if (!job) return "—";
    const jt = job.JobTitle as Record<string, unknown> | null;
    return (jt?.label as string) ?? (job.description as string) ?? "—";
  };

  const getCompany = (interview: Interview): string => {
    const job = interview.job as Record<string, unknown> | null;
    if (!job) return "";
    const co = job.Company as Record<string, unknown> | null;
    return (co?.label as string) ?? "";
  };

  const getPersonName = (interview: Interview): string => {
    const person = interview.person as Record<string, unknown> | null;
    if (!person) return "";
    return [person.firstName, person.lastName].filter(Boolean).join(" ");
  };

  // ---------------------------------------------------------------------------
  // Sub-components
  // ---------------------------------------------------------------------------

  const StatusBadge = ({ status }: { status: string }) => (
    <Badge variant={STATUS_VARIANT[status] ?? "outline"}>
      {t(`crm.interviewStatus.${status}`)}
    </Badge>
  );

  const OutcomeBadge = ({ outcome }: { outcome: string }) => (
    <Badge className={OUTCOME_CLASSES[outcome] ?? ""} variant="outline">
      {t(`crm.outcome.${outcome}`)}
    </Badge>
  );

  const InterviewCard = ({
    interview,
    showActions,
  }: {
    interview: Interview;
    showActions: boolean;
  }) => {
    const status = interview.status as string;
    const outcome = interview.outcome as string | null;
    const date = interview.interviewDate
      ? formatDateShort(new Date(interview.interviewDate as string), locale)
      : "—";
    const location = interview.location as string | null;
    const personName = getPersonName(interview);

    return (
      <Card className="group">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: info */}
          <div className="flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{getJobTitle(interview)}</span>
              <StatusBadge status={status} />
              {status === "completed" && outcome && <OutcomeBadge outcome={outcome} />}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {getCompany(interview) && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {getCompany(interview)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {date}
              </span>
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {location}
                </span>
              )}
              {personName && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {personName}
                </span>
              )}
            </div>
          </div>

          {/* Right: actions */}
          {showActions && (status === "scheduled" || status === "rescheduled") && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setCompleteTarget(interview);
                    setCompleteDialogOpen(true);
                  }}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t("crm.completeInterview")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setRescheduleTarget(interview);
                    setRescheduleDialogOpen(true);
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("crm.rescheduleInterview")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleCancel(interview.id as string)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  {t("crm.cancelInterview")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardContent>
      </Card>
    );
  };

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <Calendar className="h-12 w-12 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-lg font-medium">{t("crm.noInterviews")}</p>
        <p className="text-sm text-muted-foreground">{t("crm.noInterviewsDescription")}</p>
      </div>
      <Button onClick={() => setDialogOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        {t("crm.scheduleInterview")}
      </Button>
    </div>
  );

  const LoadingSkeleton = () => (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );

  const ErrorState = () => (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" onClick={loadInterviews}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="col-span-3 space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("crm.interviews")}</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("crm.scheduleInterview")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("crm.scheduleInterview")}</DialogTitle>
            </DialogHeader>
            <InterviewForm onSubmit={handleSchedule} submitting={submitting} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState />
      ) : upcoming.length === 0 && past.length === 0 ? (
        <EmptyState />
      ) : (
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList>
            <TabsTrigger value="upcoming">
              {t("crm.upcomingInterviews")} ({upcoming.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              {t("crm.pastInterviews")} ({past.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-3">
            {upcoming.length === 0 ? (
              <EmptyState />
            ) : (
              upcoming.map((interview) => (
                <InterviewCard
                  key={interview.id as string}
                  interview={interview}
                  showActions
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-3">
            {past.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("crm.noInterviews")}
              </p>
            ) : (
              past.map((interview) => (
                <InterviewCard
                  key={interview.id as string}
                  interview={interview}
                  showActions={false}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("crm.rescheduleInterview")}</DialogTitle>
          </DialogHeader>
          <InterviewForm
            onSubmit={handleReschedule}
            submitting={submitting}
            defaultValues={
              rescheduleTarget
                ? {
                    jobId: (rescheduleTarget.job as Record<string, unknown>)?.id as string ?? "",
                    interviewDate: rescheduleTarget.interviewDate
                      ? (rescheduleTarget.interviewDate as string).slice(0, 16)
                      : "",
                    location: (rescheduleTarget.location as string) ?? "",
                    notes: (rescheduleTarget.notes as string) ?? "",
                    personId: (rescheduleTarget.personId as string) ?? "",
                  }
                : undefined
            }
            hideJobField
          />
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("crm.completeInterview")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("crm.interviewOutcome")}</label>
              <div className="flex flex-wrap gap-2">
                {(["passed", "rejected", "waitlisted", "pending"] as InterviewOutcome[]).map(
                  (o) => (
                    <Button
                      key={o}
                      variant={selectedOutcome === o ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedOutcome(o)}
                    >
                      {t(`crm.outcome.${o}`)}
                    </Button>
                  ),
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("crm.outcomeNotes")}</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={outcomeNotes}
                onChange={(e) => setOutcomeNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCompleteDialogOpen(false);
                  setCompleteTarget(null);
                }}
              >
                {t("crm.cancelInterview")}
              </Button>
              <Button onClick={handleComplete} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("crm.completeInterview")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
