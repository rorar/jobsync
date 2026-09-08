"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { APP_CONSTANTS } from "@/lib/constants";
import { ActivityType } from "@/models/activity.model";
import ActivityTypesTable from "./ActivityTypesTable";
import { getActivityTypeList } from "@/actions/activity.actions";
import Loading from "../Loading";
import { Button } from "../ui/button";
import { RecordsPerPageSelector } from "../RecordsPerPageSelector";
import { RecordsCount } from "../RecordsCount";
import { useTranslations } from "@/i18n";

function ActivityTypesContainer() {
  const { t } = useTranslations();
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [totalActivityTypes, setTotalActivityTypes] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [recordsPerPage, setRecordsPerPage] = useState<number>(
    APP_CONSTANTS.RECORDS_PER_PAGE,
  );

  const loadActivityTypes = useCallback(
    async (page: number) => {
      setLoading(true);
      // try/finally, not a `setLoading(false)` inside `if (data)`: a failed
      // fetch must still clear the spinner rather than spin forever.
      try {
        // The third argument is a flag, not a field name: any truthy value
        // switches getActivityTypeList onto the branch that selects _count
        // (src/actions/activity.actions.ts:39-56). Without it both count
        // columns read 0 and the in-use delete guard never fires. Same shape as
        // getJobSourceList(page, limit, "applied") at JobSourcesContainer:27-31.
        const { data, total } = await getActivityTypeList(
          page,
          recordsPerPage,
          "usage",
        );
        if (data) {
          setActivityTypes((prev) => (page === 1 ? data : [...prev, ...data]));
          setTotalActivityTypes(total ?? 0);
          setPage(page);
        }
      } finally {
        setLoading(false);
      }
    },
    [recordsPerPage],
  );

  const reloadActivityTypes = useCallback(async () => {
    await loadActivityTypes(1);
  }, [loadActivityTypes]);

  useEffect(() => {
    (async () => await loadActivityTypes(1))();
  }, [loadActivityTypes, recordsPerPage]);

  return (
    <>
      <div className="col-span-3">
        <Card>
          <CardHeader className="flex-row justify-between items-center">
            <CardTitle>{t("admin.activityTypes")}</CardTitle>
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
            {activityTypes.length > 0 && (
              <>
                <ActivityTypesTable
                  activityTypes={activityTypes}
                  reloadActivityTypes={reloadActivityTypes}
                />
                <div className="flex items-center justify-between mt-4">
                  <RecordsCount
                    count={activityTypes.length}
                    total={totalActivityTypes}
                    label={t("admin.activityTypesCount")}
                  />
                  {totalActivityTypes > APP_CONSTANTS.RECORDS_PER_PAGE && (
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
              message, no explanation. All six reference tabs say something.
            */}
            {!loading && activityTypes.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {t("admin.noActivityTypes")}
              </div>
            )}
            {activityTypes.length < totalActivityTypes && (
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
                    loadActivityTypes(page + 1);
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

export default ActivityTypesContainer;
