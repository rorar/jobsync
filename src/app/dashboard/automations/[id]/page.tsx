"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateCompact } from "@/i18n";
import { useTranslations } from "@/i18n";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  Pause,
  Play,
  RefreshCw,
  Loader2,
  Clock,
  FileText,
  AlertTriangle,
  PlayCircle,
  Pencil,
} from "lucide-react";
import {
  getAutomationById,
  getDiscoveredJobs,
  getAutomationRuns,
  pauseAutomation,
  resumeAutomation,
  getDiscoveredJobById,
} from "@/actions/automation.actions";
import type {
  AutomationWithResume,
  AutomationRun,
  DiscoveredJob,
} from "@/models/automation.model";
import type { Resume } from "@/models/profile.model";
import type { JobMatchResponse } from "@/models/ai.schemas";
import { DiscoveredJobsList } from "@/components/automations/DiscoveredJobsList";
import { DiscoveredJobDetail } from "@/components/automations/DiscoveredJobDetail";
import { RunHistoryList } from "@/components/automations/RunHistoryList";
import { LogsTab } from "@/components/automations/LogsTab";
import Loading from "@/components/Loading";
import { AutomationWizard } from "@/components/automations/AutomationWizard";
import { getResumeList } from "@/actions/profile.actions";
import { parseKeywords, parseLocations } from "@/utils/automation.utils";
import { LocationBadge } from "@/components/ui/location-badge";
import { RunStatusBadge } from "@/components/automations/RunStatusBadge";
import { ModuleBusyBanner } from "@/components/automations/ModuleBusyBanner";
import { RunProgressPanel } from "@/components/scheduler/RunProgressPanel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import { ConflictWarningDialog } from "@/components/automations/ConflictWarningDialog";

export default function AutomationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useTranslations();
  const { state: schedulerState, isAutomationRunning, getModuleBusy } = useSchedulerStatus();
  const automationId = params.id as string;

  const [automation, setAutomation] = useState<
    (AutomationWithResume & { runs?: AutomationRun[] }) | null
  >(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [jobs, setJobs] = useState<DiscoveredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resumes, setResumes] = useState<{ id: string; title: string }[]>([]);
  const [selectedJob, setSelectedJob] = useState<DiscoveredJob | null>(null);
  const [selectedJobMatchData, setSelectedJobMatchData] =
    useState<JobMatchResponse | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictType, setConflictType] = useState<"blocked" | "contention">("blocked");
  const [conflictDetails, setConflictDetails] = useState<{
    automationName?: string;
    runSource?: string;
    startedAt?: Date;
    moduleId?: string;
    otherAutomations?: string[];
  }>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [automationResult, runsResult, jobsResult, resumeResult] = await Promise.all([
        getAutomationById(automationId),
        getAutomationRuns(automationId),
        getDiscoveredJobs(automationId),
        getResumeList(1, 100),
      ]);

      if (automationResult.success && automationResult.data) {
        setAutomation(automationResult.data);
        setRuns(automationResult.data.runs || []);
      } else {
        toast({
          title: t("common.error"),
          description: automationResult.message || t("automations.notFound"),
          variant: "destructive",
        });
        router.push("/dashboard/automations");
        return;
      }

      if (runsResult.success && runsResult.data) {
        setRuns(runsResult.data);
      }

      if (jobsResult.success && jobsResult.data) {
        // StagedVacancyWithAutomation is structurally compatible with DiscoveredJob at runtime
        setJobs(jobsResult.data as unknown as DiscoveredJob[]);
      }

      if (resumeResult.success && resumeResult.data) {
        setResumes(resumeResult.data.map((r: Resume) => ({ id: r.id, title: r.title })));
      }
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("automations.loadFailed"),
        variant: "destructive",
      });
    }
    setLoading(false);
  }, [automationId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePauseResume = async () => {
    if (!automation) return;

    setActionLoading(true);
    const result =
      automation.status === "active"
        ? await pauseAutomation(automation.id)
        : await resumeAutomation(automation.id);
    setActionLoading(false);

    if (result.success) {
      toast({
        title:
          automation.status === "active"
            ? t("automations.automationPaused")
            : t("automations.automationResumed"),
      });
      loadData();
    } else {
      toast({
        title: t("common.error"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const executeRun = async () => {
    if (!automation) return;

    setRunNowLoading(true);
    setRunKey((prev) => prev + 1);
    try {
      const response = await fetch(`/api/automations/${automation.id}/run`, {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: t("automations.runStarted"),
          description: t("automations.savedNewJobs").replace("{count}", String(data.run.jobsSaved ?? 0)),
        });
        loadData();
      } else if (response.status === 409) {
        toast({
          title: t("automations.alreadyRunning"),
        });
      } else {
        toast({
          title: t("common.error"),
          description: data.message || t("automations.runFailed"),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("automations.runFailed"),
        variant: "destructive",
      });
    }
    setRunNowLoading(false);
  };

  const handleRunNow = async () => {
    if (!automation) return;

    // Check for conflicts (preventive)
    if (isAutomationRunning(automation.id)) {
      const lock = schedulerState?.runningAutomations.find(
        (r) => r.automationId === automation.id
      );
      setConflictType("blocked");
      setConflictDetails({
        automationName: automation.name,
        runSource: lock?.runSource,
        startedAt: lock?.startedAt ? new Date(lock.startedAt) : undefined,
      });
      setConflictOpen(true);
      return;
    }

    const moduleBusy = getModuleBusy(automation.jobBoard).filter(
      (l) => l.automationId !== automation.id
    );
    if (moduleBusy.length > 0) {
      setConflictType("contention");
      setConflictDetails({
        moduleId: automation.jobBoard,
        otherAutomations: moduleBusy.map((l) => l.automationName),
      });
      setConflictOpen(true);
      return;
    }

    // No conflict -- proceed directly
    await executeRun();
  };

  const handleViewJobDetails = async (job: DiscoveredJob) => {
    const result = await getDiscoveredJobById(job.id);
    if (result.success && result.data) {
      // StagedVacancyWithAutomation is structurally compatible with DiscoveredJob at runtime
      setSelectedJob(result.data as unknown as DiscoveredJob);
      setSelectedJobMatchData(
        result.data.parsedMatchData as JobMatchResponse | null,
      );
      setDetailOpen(true);
    } else {
      setSelectedJob(job);
      setSelectedJobMatchData(null);
      setDetailOpen(true);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <Loading />
      </div>
    );
  }

  if (!automation) {
    return null;
  }

  const resumeMissing = !automation.resume;
  const newJobsCount = jobs.filter((j) => j.discoveryStatus === "new").length;

  return (
    <div className="col-span-3 py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/automations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{automation.name}</h1>
            <RunStatusBadge automationId={automation.id} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground">{t("automations.keywords")}:</span>
              {parseKeywords(automation.keywords)
                .map((kw: string) => (
                  <Badge key={kw} variant="secondary" className="text-xs">
                    {kw}
                  </Badge>
                ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-foreground">{t("automations.locationLabel")}:</span>
              {parseLocations(automation.location).map((code) => (
                <LocationBadge
                  key={code}
                  code={code}
                  resolve={automation.jobBoard === "eures" || automation.jobBoard === "arbeitsagentur"}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            {t("automations.edit")}
          </Button>
          <Button
            variant="outline"
            onClick={handlePauseResume}
            disabled={actionLoading || resumeMissing}
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : automation.status === "active" ? (
              <Pause className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {automation.status === "active" ? t("automations.pause") : t("automations.resume")}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    onClick={handleRunNow}
                    disabled={
                      runNowLoading || resumeMissing || automation.status === "paused" || isAutomationRunning(automation.id)
                    }
                  >
                    {runNowLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <PlayCircle className="h-4 w-4 mr-2" />
                    )}
                    {t("automations.runNow")}
                  </Button>
                </span>
              </TooltipTrigger>
              {(isAutomationRunning(automation.id) || resumeMissing || automation.status === "paused") && (
                <TooltipContent>
                  <p>
                    {isAutomationRunning(automation.id)
                      ? t("automations.alreadyRunning")
                      : automation.status === "paused"
                        ? t("automations.runNowPaused")
                        : t("automations.runNowResumeMissing")}
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("automations.statusHeader")}</p>
              <Badge
                variant={
                  automation.status === "active" ? "default" : "secondary"
                }
                className="mt-1 capitalize"
              >
                {automation.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("automations.jobBoard")}</p>
              <p className="font-medium capitalize">{automation.jobBoard}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("automations.matchThreshold")}</p>
              <p className="font-medium">{automation.matchThreshold}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("automations.stepSchedule")}</p>
              <p className="font-medium flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {automation.scheduleHour.toString().padStart(2, "0")}:00 {t("automations.daily").toLowerCase()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("automations.resumeLabel")}</p>
              {resumeMissing ? (
                <p className="text-amber-600 flex items-center gap-1 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  {t("automations.resumeMissing")}
                </p>
              ) : (
                <p className="font-medium flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {automation.resume.title}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("automations.nextRun")}</p>
              <p className="font-medium">
                {automation.nextRunAt && automation.status === "active"
                  ? formatDateCompact(new Date(automation.nextRunAt), locale)
                  : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("automations.lastRun")}</p>
              <p className="font-medium">
                {automation.lastRunAt
                  ? formatDateCompact(new Date(automation.lastRunAt), locale)
                  : t("automations.never")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("automations.discoveredJobs")}</p>
              <p className="font-medium">
                {jobs.length} {t("automations.total")}
                {newJobsCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {newJobsCount} {t("automations.new").toLowerCase()}
                  </Badge>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <RunProgressPanel automationId={automation.id} />
      <ModuleBusyBanner automationId={automation.id} moduleId={automation.jobBoard} />

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">{t("automations.tabLogs")}</TabsTrigger>
          <TabsTrigger value="jobs">
            {t("automations.discoveredJobs")}
            {newJobsCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {newJobsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">{t("automations.runHistory")}</TabsTrigger>
        </TabsList>
        <TabsContent value="logs" className="mt-4">
          <LogsTab automationId={automationId} runKey={runKey} />
        </TabsContent>
        <TabsContent value="jobs" className="mt-4">
          <DiscoveredJobsList
            jobs={jobs}
            onRefresh={loadData}
            onViewDetails={handleViewJobDetails}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <RunHistoryList runs={runs} />
        </TabsContent>
      </Tabs>

      <DiscoveredJobDetail
        job={selectedJob}
        matchData={selectedJobMatchData}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRefresh={loadData}
      />

      {automation && (
        <AutomationWizard
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) loadData();
          }}
          onSuccess={() => {
            setEditOpen(false);
            loadData();
          }}
          editAutomation={automation}
          resumes={resumes}
        />
      )}

      <ConflictWarningDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        onProceed={() => {
          setConflictOpen(false);
          executeRun();
        }}
        type={conflictType}
        conflictDetails={conflictDetails}
      />
    </div>
  );
}
