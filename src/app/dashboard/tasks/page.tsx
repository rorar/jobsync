import TasksPageClient from "./TasksPageClient";
import { getAllActivityTypes } from "@/actions/activity.actions";
import { getActivityTypesWithTaskCounts } from "@/actions/task.actions";
import React from "react";

async function Tasks() {
  const [activityTypesResult, activityTypesWithCounts] = await Promise.all([
    getAllActivityTypes(),
    getActivityTypesWithTaskCounts(),
  ]);

  const activityTypes = activityTypesResult.success ? activityTypesResult.data ?? [] : [];

  return (
    <TasksPageClient
      activityTypes={activityTypes}
      activityTypesWithCounts={(activityTypesWithCounts?.data as any) || []}
      totalTasks={activityTypesWithCounts?.total || 0}
    />
  );
}

export default Tasks;
