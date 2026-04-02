"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import {
  getAutomationById,
  getDiscoveredJobs,
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
import { ModuleBusyBanner } from "@/components/automations/ModuleBusyBanner";
import { RunProgressPanel } from "@/components/scheduler/RunProgressPanel";
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import { useConflictDetection } from "@/hooks/useConflictDetection";
import { ConflictWarningDialog } from "@/components/automations/ConflictWarningDialog";
import { AutomationDetailHeader } from "@/components/automations/AutomationDetailHeader";
import { AutomationMetadataGrid } from "@/components/automations/AutomationMetadataGrid";

export default function AutomationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslations();
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

  const {
    conflictOpen,
    conflictType,
    conflictDetails,
    setConflictOpen,
    checkConflict,
  } = useConflictDetection(automation, schedulerState, isAutomationRunning, getModuleBusy);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [automationResult, jobsResult, resumeResult] = await Promise.all([
        getAutomationById(automationId),
        getDiscoveredJobs(automationId),
        getResumeList(1, 100),
      ]);

      if (automationResult.success && automationResult.data) {
        setAutomation(automationResult.data);
        // Runs are included in getAutomationById response — no separate fetch needed (F-04)
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

    // Check for conflicts (preventive) — if conflict found, dialog opens
    if (checkConflict()) return;

    // No conflict — proceed directly
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
      <AutomationDetailHeader
        automation={automation}
        resumeMissing={resumeMissing}
        actionLoading={actionLoading}
        runNowLoading={runNowLoading}
        isRunning={isAutomationRunning(automation.id)}
        onRefresh={loadData}
        onEdit={() => setEditOpen(true)}
        onPauseResume={handlePauseResume}
        onRunNow={handleRunNow}
      />

      <AutomationMetadataGrid
        automation={automation}
        resumeMissing={resumeMissing}
        jobs={jobs}
        newJobsCount={newJobsCount}
      />

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
