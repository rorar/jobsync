import {
  getActivityCalendarData,
  getActivityDataForPeriod,
  getJobsActivityForPeriod,
  getJobsAppliedForPeriod,
  getRecentActivities,
  getRecentJobs,
  getTopActivityTypesByDuration,
} from "@/actions/dashboard.actions";
import ActivityCalendar from "@/components/dashboard/ActivityCalendar";
import JobsApplied from "@/components/dashboard/JobsAppliedCard";
import NumberCardToggle from "@/components/dashboard/NumberCardToggle";
import RecentCardToggle from "@/components/dashboard/RecentCardToggle";
import StatusFunnelWidget from "@/components/dashboard/StatusFunnelWidget";
import TopActivitiesCard from "@/components/dashboard/TopActivitiesCard";
import WeeklyBarChartToggle from "@/components/dashboard/WeeklyBarChartToggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function Dashboard() {
  const [
    { count: jobsAppliedLast7Days, trend: rawTrendFor7Days },
    { count: jobsAppliedLast30Days, trend: rawTrendFor30Days },
    recentJobs,
    recentActivities,
    weeklyData,
    activitiesData,
    activityCalendarData,
    topActivities7Days,
    topActivities30Days,
  ] = await Promise.all([
    getJobsAppliedForPeriod(7),
    getJobsAppliedForPeriod(30),
    getRecentJobs(),
    getRecentActivities(),
    getJobsActivityForPeriod(),
    getActivityDataForPeriod(),
    getActivityCalendarData(),
    getTopActivityTypesByDuration(7),
    getTopActivityTypesByDuration(30),
  ]);
  const trendFor7Days = rawTrendFor7Days ?? 0;
  const trendFor30Days = rawTrendFor30Days ?? 0;
  const activityCalendarDataKeys = Object.keys(activityCalendarData);
  const activitiesDataKeys = (data: Record<string, any>[]) =>
    Array.from(
      new Set(
        data.flatMap((entry) =>
          Object.keys(entry).filter((key) => key !== "day"),
        ),
      ),
    );
  return (
    <>
      <div className="grid auto-rows-max items-start gap-2 md:gap-2 lg:col-span-2">
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
          <JobsApplied />
          <NumberCardToggle
            data={[
              {
                label: "Last 7 days",
                num: jobsAppliedLast7Days,
                trend: trendFor7Days,
              },
              {
                label: "Last 30 days",
                num: jobsAppliedLast30Days,
                trend: trendFor30Days,
              },
            ]}
          />
          <TopActivitiesCard
            data={[
              { label: "Last 7 days", activities: topActivities7Days },
              { label: "Last 30 days", activities: topActivities30Days },
            ]}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <StatusFunnelWidget />
        </div>
        {/*
          Sprint 3 Stream G (Sprint 2 follow-up): the two `label` fields
          below are stable internal identifiers, NOT user-facing text.
          WeeklyBarChartToggle renders `labelKey` via `t()` for the
          visible toolbar + card title, and the Activities-total-hours
          gate still identifies the chart by `label === "Activities"`,
          which stays stable across locales. The `axisLeftLegend` is
          still English today — flagged as a follow-up because Nivo
          accepts only a raw string and we'd need to reroute the axis
          label through `t()` at call time.
        */}
        <WeeklyBarChartToggle
          charts={[
            {
              label: "Jobs",
              labelKey: "dashboard.chartJobs",
              data: weeklyData,
              keys: ["value"],
              axisLeftLegend: "JOBS APPLIED",
            },
            {
              label: "Activities",
              labelKey: "dashboard.chartActivities",
              data: activitiesData,
              keys: activitiesDataKeys(activitiesData),
              groupMode: "stacked",
              axisLeftLegend: "TIME SPENT (Hours)",
            },
          ]}
        />
      </div>
      <div>
        <RecentCardToggle jobs={recentJobs} activities={recentActivities} />
      </div>
      <div className="w-full col-span-3">
        <Tabs defaultValue={activityCalendarDataKeys.at(-1)}>
          <TabsList>
            {activityCalendarDataKeys.map((year) => (
              <TabsTrigger key={year} value={year}>
                {year}
              </TabsTrigger>
            ))}
          </TabsList>
          {activityCalendarDataKeys.map((year) => (
            <TabsContent key={year} value={year}>
              <ActivityCalendar year={year} data={activityCalendarData[year]} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}
