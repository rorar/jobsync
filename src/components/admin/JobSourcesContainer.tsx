"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { APP_CONSTANTS } from "@/lib/constants";
import { JobSource } from "@/models/job.model";
import JobSourcesTable from "./JobSourcesTable";
import { getJobSourceList } from "@/actions/jobSource.actions";
import Loading from "../Loading";
import { Button } from "../ui/button";
import { RecordsPerPageSelector } from "../RecordsPerPageSelector";
import { RecordsCount } from "../RecordsCount";
import { useTranslations } from "@/i18n";

function JobSourcesContainer() {
  const { t } = useTranslations();
  const [sources, setSources] = useState<JobSource[]>([]);
  const [totalJobSources, setTotalJobSources] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [recordsPerPage, setRecordsPerPage] = useState<number>(
    APP_CONSTANTS.RECORDS_PER_PAGE,
  );

  const loadJobSources = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const { data, total } = await getJobSourceList(
          page,
          recordsPerPage,
          "applied"
        );
        if (data) {
          setSources((prev) => (page === 1 ? data : [...prev, ...(data as any[])]) as any);
          setTotalJobSources(total ?? 0);
          setPage(page);
        }
      } finally {
        setLoading(false);
      }
    },
    [recordsPerPage]
  );

  const reloadJobSources = useCallback(async () => {
    await loadJobSources(1);
  }, [loadJobSources]);

  useEffect(() => {
    (async () => await loadJobSources(1))();
  }, [loadJobSources, recordsPerPage]);

  return (
    <>
      <div className="col-span-3">
        <Card x-chunk="dashboard-06-chunk-0">
          <CardHeader className="flex-row justify-between items-center">
            <CardTitle as="h2">{t("admin.jobSources")}</CardTitle>
          </CardHeader>
          <CardContent>
            {/*
              A live region that enters the DOM together with its content is
              announced inconsistently; one that is already mounted when its
              content changes is not. So the announcement lives here, always
              rendered, and the spinner below is aria-hidden so that the two
              never announce the same thing twice.
            */}
            <div role="status" aria-live="polite" className="sr-only">
              {loading ? t("common.loading") : ""}
            </div>
            {loading && (
              <div aria-hidden="true">
                <Loading />
              </div>
            )}
            {sources.length > 0 && (
              <>
                <JobSourcesTable
                  jobSources={sources}
                  reloadJobSources={reloadJobSources}
                />
                <div className="flex items-center justify-between mt-4">
                  <RecordsCount
                    count={sources.length}
                    total={totalJobSources}
                    label={t("admin.jobSourcesCount")}
                  />
                  {totalJobSources > APP_CONSTANTS.RECORDS_PER_PAGE && (
                    <RecordsPerPageSelector
                      value={recordsPerPage}
                      onChange={setRecordsPerPage}
                    />
                  )}
                </div>
              </>
            )}
            {/*
              Without this, an empty list renders a blank card: no table, no
              message, no explanation. Same shape as ActivityTypesContainer.
            */}
            {!loading && sources.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {t("admin.noJobSources")}
              </div>
            )}
            {sources.length < totalJobSources && (
              <div className="flex justify-center p-4">
                {/*
                  The label stays put: with aria-disabled the button no longer
                  vanishes from the focus model when it goes inert, and the
                  live region above already announces the load.
                */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // aria-disabled keeps the button focusable and in the tab
                    // order, so refusing the activation is the handler's job.
                    if (loading) return;
                    loadJobSources(page + 1);
                  }}
                  aria-disabled={loading}
                  className="btn btn-primary aria-disabled:opacity-50"
                >
                  {t("common.loadMore")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default JobSourcesContainer;
