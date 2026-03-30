"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import {
  getStagedVacancies,
  getStagedVacancyCounts,
  dismissStagedVacancy,
  restoreStagedVacancy,
  archiveStagedVacancy,
  trashStagedVacancy,
  restoreFromTrash,
} from "@/actions/stagedVacancy.actions";
import { toast } from "@/components/ui/use-toast";
import { useTranslations } from "@/i18n";
import { APP_CONSTANTS } from "@/lib/constants";
import { RecordsPerPageSelector } from "@/components/RecordsPerPageSelector";
import { RecordsCount } from "@/components/RecordsCount";
import Loading from "@/components/Loading";
import { StagedVacancyCard } from "./StagedVacancyCard";
import { PromotionDialog } from "./PromotionDialog";
import { BulkActionBar } from "./BulkActionBar";
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import type {
  StagedVacancyWithAutomation,
  StagedVacancyStatus,
} from "@/models/stagedVacancy.model";

type ActiveTab = "new" | "dismissed" | "archive" | "trash";

const TAB_STATUS_MAP: Record<ActiveTab, StagedVacancyStatus[]> = {
  new: ["staged", "processing", "ready"],
  dismissed: ["dismissed"],
  archive: [],
  trash: [],
};

// Map frontend tab names to backend tab parameter values
const TAB_BACKEND_MAP: Record<ActiveTab, "new" | "dismissed" | "archived" | "trashed"> = {
  new: "new",
  dismissed: "dismissed",
  archive: "archived",
  trash: "trashed",
};

function StagingContainer() {
  const { t } = useTranslations();
  const [vacancies, setVacancies] = useState<StagedVacancyWithAutomation[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("new");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [recordsPerPage, setRecordsPerPage] = useState<number>(
    APP_CONSTANTS.RECORDS_PER_PAGE,
  );
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [promotionVacancy, setPromotionVacancy] =
    useState<StagedVacancyWithAutomation | null>(null);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const hasSearched = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newItemsAvailable, setNewItemsAvailable] = useState(false);

  // Track scheduler phase transitions to detect cycle completion
  const { state: schedulerState } = useSchedulerStatus();
  const prevPhaseRef = useRef<string | null>(null);
  const schedulerPhase = useMemo(
    () => schedulerState?.phase ?? null,
    [schedulerState],
  );

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = schedulerPhase;

    // Detect transition from running/cooldown to idle (cycle completed)
    if (
      prevPhase !== null &&
      (prevPhase === "running" || prevPhase === "cooldown") &&
      schedulerPhase === "idle"
    ) {
      setNewItemsAvailable(true);
    }
  }, [schedulerPhase]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Clear selection when tab changes
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === vacancies.length && vacancies.length > 0) {
        return new Set();
      }
      return new Set(vacancies.map((v) => v.id));
    });
  }, [vacancies]);

  const loadCounts = useCallback(async () => {
    const result = await getStagedVacancyCounts();
    if (result.success && result.data) {
      setCounts(result.data);
    }
  }, []);

  const loadVacancies = useCallback(
    async (pageNum: number, tab: ActiveTab, search?: string) => {
      setLoading(true);
      const statusFilter = TAB_STATUS_MAP[tab];
      const backendTab = TAB_BACKEND_MAP[tab];

      const { success, data, total, message } = await getStagedVacancies(
        pageNum,
        recordsPerPage,
        statusFilter.length > 0 ? statusFilter : undefined,
        search,
        backendTab,
      );

      if (success && data) {
        setVacancies((prev) =>
          pageNum === 1 ? data : [...prev, ...data],
        );
        setTotalCount(total ?? 0);
        setPage(pageNum);
      } else {
        toast({
          variant: "destructive",
          title: t("staging.error"),
          description: message,
        });
      }
      setLoading(false);
    },
    [recordsPerPage, t],
  );

  const reload = useCallback(async () => {
    await Promise.all([
      loadVacancies(1, activeTab, searchTerm || undefined),
      loadCounts(),
    ]);
  }, [loadVacancies, activeTab, searchTerm, loadCounts]);

  // Load data on tab/recordsPerPage change
  useEffect(() => {
    loadVacancies(1, activeTab, searchTerm || undefined);
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, recordsPerPage]);

  // Debounced search
  useEffect(() => {
    if (searchTerm !== "") {
      hasSearched.current = true;
    }
    if (searchTerm === "" && !hasSearched.current) return;

    const timer = setTimeout(() => {
      loadVacancies(1, activeTab, searchTerm || undefined);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // Action handlers
  const handleDismiss = async (id: string) => {
    const { success, message } = await dismissStagedVacancy(id);
    if (success) {
      toast({ variant: "success", description: t("staging.dismissed") });
      reload();
    } else {
      toast({
        variant: "destructive",
        title: t("staging.error"),
        description: message,
      });
    }
  };

  const handleRestore = async (id: string) => {
    const { success, message } = await restoreStagedVacancy(id);
    if (success) {
      toast({ variant: "success", description: t("staging.restored") });
      reload();
    } else {
      toast({
        variant: "destructive",
        title: t("staging.error"),
        description: message,
      });
    }
  };

  const handleArchive = async (id: string) => {
    const { success, message } = await archiveStagedVacancy(id);
    if (success) {
      toast({ variant: "success", description: t("staging.archived") });
      reload();
    } else {
      toast({
        variant: "destructive",
        title: t("staging.error"),
        description: message,
      });
    }
  };

  const handleTrash = async (id: string) => {
    const { success, message } = await trashStagedVacancy(id);
    if (success) {
      toast({ variant: "success", description: t("staging.trashed") });
      reload();
    } else {
      toast({
        variant: "destructive",
        title: t("staging.error"),
        description: message,
      });
    }
  };

  const handleRestoreFromTrash = async (id: string) => {
    const { success, message } = await restoreFromTrash(id);
    if (success) {
      toast({ variant: "success", description: t("staging.restoredFromTrash") });
      reload();
    } else {
      toast({
        variant: "destructive",
        title: t("staging.error"),
        description: message,
      });
    }
  };

  const handlePromote = (vacancy: StagedVacancyWithAutomation) => {
    setPromotionVacancy(vacancy);
    setPromotionOpen(true);
  };

  const onTabChange = (value: string) => {
    setActiveTab(value as ActiveTab);
    setSearchTerm("");
    hasSearched.current = false;
    clearSelection();
  };

  const tabBadge = (count: number | undefined) => {
    if (count == null || count === 0) return null;
    return (
      <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs min-w-[20px] justify-center">
        {count}
      </Badge>
    );
  };

  const isAllSelected = vacancies.length > 0 && selectedIds.size === vacancies.length;

  return (
    <>
      <Card className="h-full">
        <CardHeader className="flex-row justify-between items-center">
          <CardTitle>{t("staging.title")}</CardTitle>
          <div className="flex items-center">
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={t("staging.search")}
                  className="pl-8 h-8 w-[150px] lg:w-[200px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {newItemsAvailable && (
            <div className="flex items-center justify-between p-3 mb-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <span className="text-sm">{t("automations.newItemsAvailable")}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  reload();
                  setNewItemsAvailable(false);
                }}
              >
                {t("automations.showNewItems")}
              </Button>
            </div>
          )}
          {mounted ? (
            <Tabs value={activeTab} onValueChange={onTabChange}>
              <TabsList>
                <TabsTrigger value="new">
                  {t("staging.tabNew")}
                  {tabBadge(counts.new)}
                </TabsTrigger>
                <TabsTrigger value="dismissed">
                  {t("staging.tabDismissed")}
                  {tabBadge(counts.dismissed)}
                </TabsTrigger>
                <TabsTrigger value="archive">
                  {t("staging.tabArchive")}
                  {tabBadge(counts.archived)}
                </TabsTrigger>
                <TabsTrigger value="trash">
                  {t("staging.tabTrash")}
                  {tabBadge(counts.trashed)}
                </TabsTrigger>
              </TabsList>
              <TabsContent value={activeTab}>
                {loading && <Loading />}
                {!loading && vacancies.length > 0 && (
                  <>
                    {/* Select All + Bulk Action Bar */}
                    <div className="flex items-center gap-2 mb-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input accent-primary"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                        />
                        {t("staging.selectAll")}
                      </label>
                    </div>
                    <BulkActionBar
                      selectedIds={selectedIds}
                      activeTab={activeTab}
                      onActionComplete={reload}
                      onClearSelection={clearSelection}
                    />
                    {vacancies.map((vacancy) => (
                      <StagedVacancyCard
                        key={vacancy.id}
                        vacancy={vacancy}
                        activeTab={activeTab}
                        selected={selectedIds.has(vacancy.id)}
                        onToggleSelect={toggleSelection}
                        onDismiss={handleDismiss}
                        onRestore={handleRestore}
                        onArchive={handleArchive}
                        onTrash={handleTrash}
                        onRestoreFromTrash={handleRestoreFromTrash}
                        onPromote={handlePromote}
                      />
                    ))}
                    <div className="flex items-center justify-between mt-4">
                      <RecordsCount
                        count={vacancies.length}
                        total={totalCount}
                        label={t("staging.vacancies")}
                      />
                      {totalCount > APP_CONSTANTS.RECORDS_PER_PAGE && (
                        <RecordsPerPageSelector
                          value={recordsPerPage}
                          onChange={setRecordsPerPage}
                        />
                      )}
                    </div>
                  </>
                )}
                {!loading && vacancies.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {t("staging.noVacancies")}
                  </div>
                )}
                {vacancies.length < totalCount && (
                  <div className="flex justify-center p-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        loadVacancies(
                          page + 1,
                          activeTab,
                          searchTerm || undefined,
                        )
                      }
                      disabled={loading}
                      className="btn btn-primary"
                    >
                      {loading ? t("common.loading") : t("common.loadMore")}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <Loading />
          )}
        </CardContent>
        <CardFooter />
      </Card>
      <PromotionDialog
        open={promotionOpen}
        onOpenChange={setPromotionOpen}
        vacancy={promotionVacancy}
        onSuccess={reload}
      />
    </>
  );
}

export default StagingContainer;
