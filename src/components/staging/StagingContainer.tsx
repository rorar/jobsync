"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  promoteStagedVacancyToJob,
} from "@/actions/stagedVacancy.actions";
import { addBlacklistEntry } from "@/actions/companyBlacklist.actions";
import { toast } from "@/components/ui/use-toast";
import { useTranslations } from "@/i18n";
import { APP_CONSTANTS } from "@/lib/constants";
import { RecordsPerPageSelector } from "@/components/RecordsPerPageSelector";
import { RecordsCount } from "@/components/RecordsCount";
import Loading from "@/components/Loading";
import { StagedVacancyCard } from "./StagedVacancyCard";
import { StagedVacancyDetailSheet } from "./StagedVacancyDetailSheet";
import { PromotionDialog } from "./PromotionDialog";
import { BlockConfirmationDialog } from "./BlockConfirmationDialog";
import { BulkActionBar } from "./BulkActionBar";
import { StagingNewItemsBanner } from "./StagingNewItemsBanner";
import { ViewModeToggle, getPersistedViewMode } from "./ViewModeToggle";
import type { ViewMode } from "./ViewModeToggle";
import { DeckView, AUTO_APPROVE_KEY } from "./DeckView";
import { StagingLayoutToggle } from "./StagingLayoutToggle";
import { useStagingActions } from "@/hooks/useStagingActions";
import { useStagingLayout, getStagingMaxWidthClass } from "@/hooks/useStagingLayout";
import type { DeckAction } from "@/hooks/useDeckStack";
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
  const [blockConfirmVacancy, setBlockConfirmVacancy] = useState<StagedVacancyWithAutomation | null>(null);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const blockResolveRef = useRef<((result: { success: boolean; createdJobId?: string }) => void) | null>(null);
  // Details sheet (Stream C / task 2) — opened from list card click or deck Info button
  const [detailsVacancy, setDetailsVacancy] = useState<StagedVacancyWithAutomation | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsMode, setDetailsMode] = useState<"list" | "deck">("list");
  const hasSearched = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const { size: layoutSize, setSize: setLayoutSize } = useStagingLayout();

  useEffect(() => {
    setMounted(true);
    setViewMode(getPersistedViewMode());
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

  // Action handlers — consolidated via useStagingActions factory
  const { createHandler } = useStagingActions(reload);
  const handleDismiss = createHandler(dismissStagedVacancy, "staging.dismissed");
  const handleRestore = createHandler(restoreStagedVacancy, "staging.restored");
  const handleArchive = createHandler(archiveStagedVacancy, "staging.archived");
  const handleTrash = createHandler(trashStagedVacancy, "staging.trashed");
  const handleRestoreFromTrash = createHandler(restoreFromTrash, "staging.restoredFromTrash");

  const handlePromote = (vacancy: StagedVacancyWithAutomation) => {
    setPromotionVacancy(vacancy);
    setPromotionOpen(true);
  };

  // Open the details sheet (Stream C / task 2). `mode` selects the footer
  // action set: list mode offers the full CRUD; deck mode offers the 4 swipe
  // actions + skip. The sheet NEVER advances the deck index on open/close.
  const handleOpenDetails = useCallback(
    (vacancy: StagedVacancyWithAutomation, mode: "list" | "deck") => {
      setDetailsVacancy(vacancy);
      setDetailsMode(mode);
      setDetailsOpen(true);
    },
    [],
  );

  const handleBlockCompany = useCallback(async (companyName: string) => {
    const result = await addBlacklistEntry(companyName, "contains");
    if (result.success) {
      const trashedCount = result.data?.trashedCount ?? 0;
      toast({
        title: t("blacklist.blocked"),
        description: trashedCount > 0
          ? t("blacklist.filtered").replace("{count}", String(trashedCount))
          : undefined,
      });
      reload();
    } else {
      toast({
        title: result.message ? t(result.message) : t("common.error"),
        variant: "destructive",
      });
    }
  }, [t, reload]);

  // Ref to resolve the promotion dialog promise from outside
  const promotionResolveRef = useRef<((result: { success: boolean; createdJobId?: string }) => void) | null>(null);

  // Cleanup: resolve pending promises on unmount to prevent permanent UI freeze
  useEffect(() => {
    return () => {
      if (promotionResolveRef.current) {
        promotionResolveRef.current({ success: false });
        promotionResolveRef.current = null;
      }
      if (blockResolveRef.current) {
        blockResolveRef.current({ success: false });
        blockResolveRef.current = null;
      }
    };
  }, []);

  // Deck mode action handler — maps DeckAction to existing server actions
  // Returns { success, createdJobId? } so useDeckStack can roll back the card
  // on failure and forward the created Job id to the super-like fly-in.
  const handleDeckAction = useCallback(
    async (
      vacancy: StagedVacancyWithAutomation,
      action: DeckAction,
    ): Promise<{ success: boolean; createdJobId?: string }> => {
      if (action === "dismiss") {
        const { success, message } = await dismissStagedVacancy(vacancy.id);
        if (success) {
          toast({ variant: "success", description: t("staging.dismissed") });
        } else {
          toast({ variant: "destructive", title: t("staging.error"), description: message });
        }
        return { success };
      } else if (action === "promote" || action === "superlike") {
        // Check auto-approve preference
        const autoApprove = (() => {
          try { return localStorage.getItem(AUTO_APPROVE_KEY) === "true"; }
          catch (e) {
            console.warn("[StagingContainer] Failed to read auto-approve preference:", e);
            return false;
          }
        })();

        if (autoApprove) {
          // Skip dialog — promote immediately with defaults
          const result = await promoteStagedVacancyToJob({
            stagedVacancyId: vacancy.id,
          });
          if (result.success) {
            toast({ variant: "success", description: t("staging.promoted") });
            reload();
          } else {
            toast({ variant: "destructive", title: t("staging.error"), description: result.message });
          }
          // Dev diagnostics — surface silent contract drift if the server
          // action reports success but omits the created jobId. The deck
          // celebration fly-in relies on createdJobId being populated, so a
          // drift here would silently break super-like UX without any error.
          if (result.success && !result.data?.jobId) {
            console.warn(
              "[StagingContainer] promoteStagedVacancyToJob succeeded but returned no jobId",
              { stagedVacancyId: vacancy.id, result },
            );
          }
          return { success: result.success, createdJobId: result.data?.jobId };
        }

        // Open the promotion dialog and wait for result
        return new Promise<{ success: boolean; createdJobId?: string }>((resolve) => {
          promotionResolveRef.current = resolve;
          setPromotionVacancy(vacancy);
          setPromotionOpen(true);
        });
      } else if (action === "block") {
        // Block company + dismiss vacancy — requires confirmation
        if (!vacancy.employerName) {
          toast({
            variant: "destructive",
            title: t("staging.error"),
            description: t("deck.blockNoEmployerName"),
          });
          return { success: false };
        }
        // Open confirmation dialog and wait
        return new Promise<{ success: boolean; createdJobId?: string }>((resolve) => {
          blockResolveRef.current = resolve;
          setBlockConfirmVacancy(vacancy);
          setBlockConfirmOpen(true);
        });
      } else if (action === "skip") {
        // Skip does not call any server action — handled by useDeckStack
        return { success: true };
      }
      return { success: true };
    },
    [t, reload, handleBlockCompany],
  );

  const handleDeckUndo = useCallback(
    async (entry: { vacancy: StagedVacancyWithAutomation; action: DeckAction }) => {
      if (entry.action === "dismiss") {
        const { success, message } = await restoreStagedVacancy(entry.vacancy.id);
        if (!success) {
          toast({ variant: "destructive", title: t("staging.error"), description: message });
        }
      }
      // promote/superlike undo is more complex (would need to delete the promoted job)
      // For now, undo only works for dismiss actions
    },
    [t],
  );

  // Details sheet adapters — mode-aware routing.
  //
  // In LIST mode, the sheet fires against the usual CRUD handlers (handleDismiss
  // takes an id, handlePromote opens the PromotionDialog, etc.).
  //
  // In DECK mode, the sheet MUST route through `handleDeckAction` so that:
  //   - deck stats (stats.promoted, stats.dismissed, stats.superLiked) update,
  //   - the undo stack records the action,
  //   - the optimistic card-exit animation plays,
  //   - super-like triggers the onSuperLikeSuccess → celebration fly-in,
  //   - the deck index advances so the next card appears.
  //
  // Without this routing, sheet actions in deck mode would silently bypass the
  // deck state machine — the user would close the sheet and see the same card
  // still in front of them with stale stats (honesty gate finding #17).
  const detailsDismissAdapter = useCallback(
    async (vacancy: StagedVacancyWithAutomation) => {
      if (detailsMode === "deck") {
        await handleDeckAction(vacancy, "dismiss");
      } else {
        await handleDismiss(vacancy.id);
      }
    },
    [detailsMode, handleDeckAction, handleDismiss],
  );
  const detailsArchiveAdapter = useCallback(
    async (vacancy: StagedVacancyWithAutomation) => {
      // Archive is a list-only action — not a deck action.
      // In deck mode, the sheet does not expose an Archive button.
      await handleArchive(vacancy.id);
    },
    [handleArchive],
  );
  const detailsPromoteAdapter = useCallback(
    async (vacancy: StagedVacancyWithAutomation) => {
      if (detailsMode === "deck") {
        await handleDeckAction(vacancy, "promote");
      } else {
        handlePromote(vacancy);
      }
    },
    [detailsMode, handleDeckAction],
  );
  // Super-like is a DISTINCT action from promote: in deck mode it triggers
  // the celebration fly-in via onSuperLikeSuccess. Wiring this to the promote
  // adapter (as the previous integration commit did) silently swallowed the
  // celebration — honesty gate finding #16.
  const detailsSuperLikeAdapter = useCallback(
    async (vacancy: StagedVacancyWithAutomation) => {
      if (detailsMode === "deck") {
        await handleDeckAction(vacancy, "superlike");
      } else {
        // In list mode, super-like falls back to promote (same server action,
        // no deck to feed the celebration hook). Explicit fallback — not a typo.
        handlePromote(vacancy);
      }
    },
    [detailsMode, handleDeckAction],
  );
  const detailsBlockAdapter = useCallback(
    async (vacancy: StagedVacancyWithAutomation) => {
      if (detailsMode === "deck") {
        await handleDeckAction(vacancy, "block");
      } else if (vacancy.employerName) {
        await handleBlockCompany(vacancy.employerName);
      }
    },
    [detailsMode, handleDeckAction, handleBlockCompany],
  );

  const onTabChange = (value: string) => {
    setVacancies([]);
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
      <div className={`mx-auto w-full ${getStagingMaxWidthClass(layoutSize)} transition-[max-width] duration-200`}>
      <Card className="h-full">
        <CardHeader className="flex-row justify-between items-center">
          <CardTitle>{t("staging.title")}</CardTitle>
          <div className="flex items-center gap-2">
            <StagingLayoutToggle value={layoutSize} onChange={setLayoutSize} />
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            {viewMode === "list" && (
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={t("staging.search")}
                  aria-label={t("staging.searchLabel")}
                  className="pl-8 h-8 w-[150px] lg:w-[200px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <StagingNewItemsBanner onRefresh={reload} />
          {mounted && viewMode === "deck" ? (
            /* Deck View — card-based swipe UI for "new" tab only */
            <DeckView
              vacancies={activeTab === "new" ? vacancies : []}
              onAction={handleDeckAction}
              onUndo={handleDeckUndo}
              onBackToList={() => setViewMode("list")}
              onOpenDetails={(vacancy) => handleOpenDetails(vacancy, "deck")}
              isDetailsOpen={detailsOpen}
            />
          ) : mounted ? (
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
                          className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                        onBlockCompany={handleBlockCompany}
                        onOpenDetails={(v) => handleOpenDetails(v, "list")}
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
      </div>
      {/* Details sheet (Stream C / task 2) — sibling to dialogs, portaled */}
      <StagedVacancyDetailSheet
        vacancy={detailsVacancy}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        mode={detailsMode}
        onDismiss={detailsDismissAdapter}
        onArchive={detailsArchiveAdapter}
        onPromote={detailsPromoteAdapter}
        onSuperLike={detailsSuperLikeAdapter}
        onBlock={detailsBlockAdapter}
      />
      <PromotionDialog
        open={promotionOpen}
        onOpenChange={(open) => {
          setPromotionOpen(open);
          // If dialog is closing and we still have a pending promise,
          // it means it was NOT resolved via onSuccess — treat as cancel.
          // Use queueMicrotask to let onSuccess fire first if both are called
          // in the same synchronous block (PromotionDialog calls onOpenChange then onSuccess).
          if (!open) {
            queueMicrotask(() => {
              if (promotionResolveRef.current) {
                promotionResolveRef.current({ success: false });
                promotionResolveRef.current = null;
              }
            });
          }
        }}
        vacancy={promotionVacancy}
        onSuccess={() => {
          // Resolve the promise as success — called synchronously after onOpenChange(false)
          if (promotionResolveRef.current) {
            promotionResolveRef.current({ success: true });
            promotionResolveRef.current = null;
          }
          reload();
        }}
      />
      <BlockConfirmationDialog
        open={blockConfirmOpen}
        onOpenChange={(open) => {
          setBlockConfirmOpen(open);
          if (!open) {
            queueMicrotask(() => {
              if (blockResolveRef.current) {
                blockResolveRef.current({ success: false });
                blockResolveRef.current = null;
              }
            });
          }
        }}
        vacancy={blockConfirmVacancy}
        onConfirm={async () => {
          if (blockConfirmVacancy?.employerName) {
            await handleBlockCompany(blockConfirmVacancy.employerName);
          }
          if (blockResolveRef.current) {
            blockResolveRef.current({ success: true });
            blockResolveRef.current = null;
          }
          setBlockConfirmOpen(false);
        }}
      />
    </>
  );
}

export default StagingContainer;
