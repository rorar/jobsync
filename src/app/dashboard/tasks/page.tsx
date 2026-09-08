import TasksPageClient from "./TasksPageClient";
import { getAllActivityTypes } from "@/actions/activity.actions";
import { getActivityTypesWithTaskCounts } from "@/actions/task.actions";
import { getUserLocale, t } from "@/i18n/server";
import React from "react";

async function Tasks() {
  const [activityTypesResult, activityTypesWithCounts, locale] = await Promise.all([
    getAllActivityTypes(),
    getActivityTypesWithTaskCounts(),
    getUserLocale(),
  ]);

  const activityTypes = activityTypesResult.success ? activityTypesResult.data ?? [] : [];

  return (
    <>
      <h1 className="sr-only">{t(locale, "nav.tasks")}</h1>
      <TasksPageClient
        activityTypes={activityTypes}
        activityTypesWithCounts={(activityTypesWithCounts?.data as any) || []}
        totalTasks={activityTypesWithCounts?.total || 0}
      />
    </>
  );
}

export default Tasks;
