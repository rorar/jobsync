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
            {loading && <Loading />}
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
              The other five reference tabs render nothing at all on an empty
              list, so a brand-new user sees a blank card. Say something instead.
            */}
            {!loading && activityTypes.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {t("admin.noActivityTypes")}
              </div>
            )}
            {activityTypes.length < totalActivityTypes && (
              <div className="flex justify-center p-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadActivityTypes(page + 1)}
                  disabled={loading}
                  className="btn btn-primary"
                >
                  {loading ? t("common.loading") : t("common.loadMore")}
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
