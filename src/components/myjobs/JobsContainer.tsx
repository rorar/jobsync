"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "@/i18n";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { File, ListFilter, Search } from "lucide-react";
import {
  deleteJobById,
  getJobDetails,
  getJobsList,
  getKanbanBoard,
  updateJobStatus,
} from "@/actions/job.actions";
import type { KanbanBoard as KanbanBoardData } from "@/actions/job.actions";
import { toast } from "../ui/use-toast";
import {
  Company,
  JobLocation,
  JobResponse,
  JobSource,
  JobStatus,
  JobTitle,
  Tag,
} from "@/models/job.model";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { APP_CONSTANTS } from "@/lib/constants";
import Loading from "../Loading";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AddJob } from "./AddJob";
import MyJobsTable from "./MyJobsTable";
import { NoteDialog } from "./NoteDialog";
import { format } from "date-fns";
import { RecordsPerPageSelector } from "../RecordsPerPageSelector";
import { RecordsCount } from "../RecordsCount";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanViewModeToggle } from "@/components/kanban/KanbanViewModeToggle";
import { type KanbanViewMode, getPersistedViewMode } from "@/hooks/useKanbanState";

type MyJobsProps = {
  statuses: JobStatus[];
  companies: Company[];
  titles: JobTitle[];
  locations: JobLocation[];
  sources: JobSource[];
  tags: Tag[];
};

/**
 * Normalizer: Convert KanbanBoard server response to JobResponse[] for the
 * KanbanBoard component. The Kanban components expect JobResponse shape
 * (with JobTitle.label, Company.label, Status, etc.), so we adapt the
 * lightweight KanbanJob into that shape.
 *
 * This adapter keeps the Kanban components (KanbanBoard, KanbanCard) clean
 * — they continue working with JobResponse without knowing about the
 * dedicated server action's return type.
 */
function kanbanBoardToJobResponses(board: KanbanBoardData): JobResponse[] {
  const jobs: JobResponse[] = [];
  for (const column of board.columns) {
    for (const kanbanJob of column.jobs) {
      jobs.push({
        id: kanbanJob.id,
        userId: "", // Not needed for Kanban display
        JobTitle: { id: "", label: kanbanJob.title, value: "", createdBy: "" },
        Company: {
          id: "",
          label: kanbanJob.company,
          value: "",
          createdBy: "",
          logoUrl: kanbanJob.companyLogoUrl,
        },
        Status: {
          id: column.statusId,
          label: column.statusLabel,
          value: column.statusValue,
        },
        Location: kanbanJob.location
          ? { id: "", label: kanbanJob.location, value: "", createdBy: "" }
          : null,
        jobType: "",
        createdAt: kanbanJob.createdAt,
        appliedDate: null,
        dueDate: kanbanJob.dueDate,
        salaryRange: null,
        jobUrl: null,
        applied: false,
        matchScore: kanbanJob.matchScore,
        sortOrder: kanbanJob.sortOrder,
        tags: kanbanJob.tags.map((tag) => ({ ...tag, createdBy: "" })),
      });
    }
  }
  return jobs;
}

function JobsContainer({
  statuses,
  companies,
  titles,
  locations,
  sources,
  tags,
}: MyJobsProps) {
  const { t } = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const queryParams = useSearchParams();
  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(queryParams.toString());
      params.set(name, value);

      return params.toString();
    },
    [queryParams],
  );
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [page, setPage] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const [filterKey, setFilterKey] = useState<string>();
  const [searchTerm, setSearchTerm] = useState("");
  const [editJob, setEditJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recordsPerPage, setRecordsPerPage] = useState<number>(
    APP_CONSTANTS.RECORDS_PER_PAGE,
  );
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteJobId, setNoteJobId] = useState("");
  const hasSearched = useRef(false);
  const [viewMode, setViewMode] = useState<KanbanViewMode>("kanban");
  const [mounted, setMounted] = useState(false);
  const [kanbanJobs, setKanbanJobs] = useState<JobResponse[]>([]);
  const [kanbanLoading, setKanbanLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    setViewMode(getPersistedViewMode());
  }, []);

  /**
   * Load all jobs via the dedicated getKanbanBoard() server action.
   * Returns ALL jobs (no pagination) with tags included — fixes DAU-7.
   */
  const loadKanbanBoardData = useCallback(async () => {
    setKanbanLoading(true);
    const result = await getKanbanBoard();
    if (result.success && result.data) {
      setKanbanJobs(kanbanBoardToJobResponses(result.data));
    } else {
      toast({
        variant: "destructive",
        title: t("jobs.error"),
        description: result.message,
      });
    }
    setKanbanLoading(false);
  }, [t]);

  const jobsPerPage = recordsPerPage;

  const loadJobs = useCallback(
    async (page: number, filter?: string, search?: string) => {
      setLoading(true);
      const { success, data, total, message } = await getJobsList(
        page,
        jobsPerPage,
        filter,
        search,
      );
      if (success && data) {
        setJobs((prev) => (page === 1 ? data : [...prev, ...(data as any[])]) as any);
        setTotalJobs(total ?? 0);
        setPage(page);
        setLoading(false);
      } else {
        toast({
          variant: "destructive",
          title: t("jobs.error"),
          description: message,
        });
        setLoading(false);
        return;
      }
    },
    [jobsPerPage],
  );

  const reloadJobs = useCallback(async () => {
    await loadJobs(1, undefined, searchTerm || undefined);
    if (filterKey) {
      setFilterKey(undefined);
    }
  }, [loadJobs, filterKey, searchTerm]);

  /** Reload for Kanban view — reloads via the dedicated getKanbanBoard path */
  const reloadKanban = useCallback(async () => {
    await loadKanbanBoardData();
  }, [loadKanbanBoardData]);

  const onDeleteJob = async (jobId: string) => {
    const { success, message } = await deleteJobById(jobId);
    if (success) {
      toast({
        variant: "success",
        description: t("jobs.deletedSuccess"),
      });
    } else {
      toast({
        variant: "destructive",
        title: t("jobs.error"),
        description: message,
      });
    }
    reloadJobs();
  };

  const onEditJob = async (jobId: string) => {
    const { data: job, success, message } = await getJobDetails(jobId);
    if (!success) {
      toast({
        variant: "destructive",
        title: t("jobs.error"),
        description: message,
      });
      return;
    }
    setEditJob(job as any);
  };

  const onChangeJobStatus = async (jobId: string, jobStatus: JobStatus) => {
    const { success, message } = await updateJobStatus(jobId, jobStatus);
    if (success) {
      router.refresh();
      toast({
        variant: "success",
        description: t("jobs.updatedSuccess"),
      });
    } else {
      toast({
        variant: "destructive",
        title: t("jobs.error"),
        description: message,
      });
    }
    reloadJobs();
  };

  const resetEditJob = () => {
    setEditJob(null);
  };

  /** Trigger the AddJob dialog from the Kanban empty state CTA */
  const handleKanbanAddJob = useCallback(() => {
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="add-job-btn"]');
    btn?.click();
  }, []);

  const onAddNote = (jobId: string) => {
    setNoteJobId(jobId);
    setNoteDialogOpen(true);
  };

  useEffect(() => {
    (async () => await loadJobs(1))();
  }, [loadJobs]);

  // Load Kanban board data via the dedicated endpoint (all jobs, with tags)
  useEffect(() => {
    loadKanbanBoardData();
  }, [loadKanbanBoardData]);

  useEffect(() => {
    if (searchTerm !== "") {
      hasSearched.current = true;
    }
    // Skip only on initial mount when search is empty
    if (searchTerm === "" && !hasSearched.current) return;

    const timer = setTimeout(() => {
      loadJobs(1, filterKey, searchTerm || undefined);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const onFilterChange = (filterBy: string) => {
    if (filterBy === "none") {
      setFilterKey(undefined);
      loadJobs(1, undefined, searchTerm || undefined);
    } else {
      setFilterKey(filterBy);
      loadJobs(1, filterBy, searchTerm || undefined);
    }
  };

  const downloadJobsList = async () => {
    try {
      const res = await fetch("/api/jobs/export", {
        method: "POST",
        headers: {
          "Content-Type": "text/csv",
        },
      });
      if (!res.ok) {
        throw new Error(t("jobs.downloadFailed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `jobsync-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({
        variant: "success",
        title: t("jobs.downloadSuccess"),
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("jobs.error"),
        description:
          error instanceof Error ? error.message : t("jobs.downloadFailed"),
      });
    }
  };

  return (
    <>
      <Card x-chunk="dashboard-06-chunk-0">
        <CardHeader className="flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <CardTitle>{t("jobs.title")}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {mounted && (
              <KanbanViewModeToggle value={viewMode} onChange={setViewMode} />
            )}
            <div className="relative flex-1 min-w-[140px] sm:flex-none">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={t("jobs.searchPlaceholder")}
                aria-label={t("jobs.searchPlaceholder")}
                className="pl-8 h-8 w-full sm:w-[150px] lg:w-[200px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterKey} onValueChange={onFilterChange}>
              <SelectTrigger className="w-[120px] h-8" aria-label={t("jobs.filterBy")}>
                <ListFilter className="h-3.5 w-3.5" />
                <SelectValue placeholder={t("jobs.filter")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{t("jobs.filterBy")}</SelectLabel>
                  <SelectSeparator />
                  <SelectItem value="none">{t("jobs.none")}</SelectItem>
                  <SelectItem value="applied">{t("jobs.applied")}</SelectItem>
                  <SelectItem value="interview">{t("jobs.interview")}</SelectItem>
                  <SelectItem value="draft">{t("jobs.draft")}</SelectItem>
                  <SelectItem value="rejected">{t("jobs.rejected")}</SelectItem>
                  <SelectItem value="PT">{t("jobs.partTime")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              disabled={loading || totalJobs === 0}
              title={totalJobs === 0 ? t("jobs.noJobsToExport") : ""}
              onClick={downloadJobsList}
            >
              <File className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                {t("jobs.export")}
              </span>
            </Button>
            <AddJob
              jobStatuses={statuses}
              companies={companies}
              jobTitles={titles}
              locations={locations}
              jobSources={sources}
              tags={tags}
              editJob={editJob}
              resetEditJob={resetEditJob}
            />
          </div>
        </CardHeader>
        <CardContent>
          {mounted && viewMode === "kanban" ? (
            <KanbanBoard
              jobs={kanbanJobs}
              statuses={statuses}
              onRefresh={reloadKanban}
              loading={kanbanLoading}
              onAddJob={handleKanbanAddJob}
            />
          ) : (
            <>
              {loading && <Loading />}
              {jobs.length > 0 && (
                <>
                  <MyJobsTable
                    jobs={jobs}
                    jobStatuses={statuses}
                    deleteJob={onDeleteJob}
                    editJob={onEditJob}
                    onChangeJobStatus={onChangeJobStatus}
                    onAddNote={onAddNote}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-4">
                    <RecordsCount
                      count={jobs.length}
                      total={totalJobs}
                      label="jobs"
                    />
                    {totalJobs > APP_CONSTANTS.RECORDS_PER_PAGE && (
                      <RecordsPerPageSelector
                        value={recordsPerPage}
                        onChange={setRecordsPerPage}
                      />
                    )}
                  </div>
                </>
              )}
              {jobs.length < totalJobs && (
                <div className="flex justify-center p-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      loadJobs(page + 1, filterKey, searchTerm || undefined)
                    }
                    disabled={loading}
                    className="btn btn-primary"
                  >
                    {loading ? t("common.loading") : t("jobs.loadMore")}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
        <CardFooter></CardFooter>
      </Card>
      <NoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        jobId={noteJobId}
        onSaved={() => reloadJobs()}
      />
    </>
  );
}

export default JobsContainer;
