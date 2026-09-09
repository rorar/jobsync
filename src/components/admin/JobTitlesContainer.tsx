"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { APP_CONSTANTS } from "@/lib/constants";
import { JobTitle } from "@prisma/client";
import JobTitlesTable from "./JobTitlesTable";
import { getJobTitleList } from "@/actions/jobtitle.actions";
import Loading from "../Loading";
import { Button } from "../ui/button";
import { RecordsPerPageSelector } from "../RecordsPerPageSelector";
import { RecordsCount } from "../RecordsCount";
import { useTranslations } from "@/i18n";

function JobTitlesContainer() {
  const { t } = useTranslations();
  const [titles, setTitles] = useState<JobTitle[]>([]);
  const [totalJobTitles, setTotalJobTitles] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [recordsPerPage, setRecordsPerPage] = useState<number>(
    APP_CONSTANTS.RECORDS_PER_PAGE,
  );

  const loadJobTitles = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const { data, total } = await getJobTitleList(
          page,
          recordsPerPage,
          "applied"
        );
        if (data) {
          setTitles((prev) => (page === 1 ? data : [...prev, ...(data as any[])]) as any);
          setTotalJobTitles(total ?? 0);
          setPage(page);
        }
      } finally {
        setLoading(false);
      }
    },
    [recordsPerPage]
  );

  const reloadJobTitles = useCallback(async () => {
    await loadJobTitles(1);
  }, [loadJobTitles]);

  useEffect(() => {
    (async () => await loadJobTitles(1))();
  }, [loadJobTitles, recordsPerPage]);

  return (
    <>
      <div className="col-span-3">
        <Card x-chunk="dashboard-06-chunk-0">
          <CardHeader className="flex-row justify-between items-center">
            <CardTitle as="h2">{t("admin.jobTitles")}</CardTitle>
            <div className="flex items-center">
              <div className="ml-auto flex items-center gap-2">
                {/* <AddCompany reloadCompanies={reloadJobTitles} /> */}
              </div>
            </div>
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
            {titles.length > 0 && (
              <>
                <JobTitlesTable
                  jobTitles={titles}
                  reloadJobTitles={reloadJobTitles}
                />
                <div className="flex items-center justify-between mt-4">
                  <RecordsCount
                    count={titles.length}
                    total={totalJobTitles}
                    label="job titles"
                  />
                  {totalJobTitles > APP_CONSTANTS.RECORDS_PER_PAGE && (
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
            {!loading && titles.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {t("admin.noJobTitles")}
              </div>
            )}
            {titles.length < totalJobTitles && (
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
                    loadJobTitles(page + 1);
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

export default JobTitlesContainer;
