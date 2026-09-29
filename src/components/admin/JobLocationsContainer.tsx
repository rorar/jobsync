"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { APP_CONSTANTS } from "@/lib/constants";
import { JobTitle } from "@prisma/client";
import JobLocationsTable from "./JobLocationsTable";
import { getJobLocationsList } from "@/actions/jobLocation.actions";
import Loading from "../Loading";
import { Button } from "../ui/button";
import { RecordsPerPageSelector } from "../RecordsPerPageSelector";
import { RecordsCount } from "../RecordsCount";
import { useTranslations } from "@/i18n";

function JobLocationsContainer() {
  const { t } = useTranslations();
  const [locations, setLocations] = useState<JobTitle[]>([]);
  const [totalJobLocations, setTotalJobLocations] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [recordsPerPage, setRecordsPerPage] = useState<number>(
    APP_CONSTANTS.RECORDS_PER_PAGE,
  );

  const loadJobLocations = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const { data, total } = await getJobLocationsList(
          page,
          recordsPerPage,
          "applied"
        );
        if (data) {
          setLocations((prev) => (page === 1 ? data : [...prev, ...(data as any[])]) as any);
          setTotalJobLocations(total ?? 0);
          setPage(page);
        }
      } finally {
        setLoading(false);
      }
    },
    [recordsPerPage]
  );

  const reloadJobLocations = useCallback(async () => {
    await loadJobLocations(1);
  }, [loadJobLocations]);

  useEffect(() => {
    (async () => await loadJobLocations(1))();
  }, [loadJobLocations, recordsPerPage]);

  return (
    <>
      <div className="col-span-3">
        <Card x-chunk="dashboard-06-chunk-0">
          <CardHeader className="flex-row justify-between items-center">
            <CardTitle as="h2">{t("admin.jobLocations")}</CardTitle>
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
            {locations.length > 0 && (
              <>
                <JobLocationsTable
                  jobLocations={locations}
                  reloadJobLocations={reloadJobLocations}
                />
                <div className="flex items-center justify-between mt-4">
                  <RecordsCount
                    count={locations.length}
                    total={totalJobLocations}
                    label="job locations"
                  />
                  {totalJobLocations > APP_CONSTANTS.RECORDS_PER_PAGE && (
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
            {!loading && locations.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {t("admin.noJobLocations")}
              </div>
            )}
            {locations.length < totalJobLocations && (
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
                    loadJobLocations(page + 1);
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

export default JobLocationsContainer;
