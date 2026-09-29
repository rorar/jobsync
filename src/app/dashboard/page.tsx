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
import { getUserLocale, t } from "@/i18n/server";

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
    locale,
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
    getUserLocale(),
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
      {/*
        Visually hidden, deliberately. These dashboard pages render no visible
        page title today, so adding one would be a design change rather than an
        accessibility fix. Without it the heading outline starts at CardTitle,
        which renders an h3 (src/components/ui/card.tsx:36), so a screen-reader
        user navigating by headings finds nothing naming the page they are on
        (WCAG 2.4.6, 1.3.1). `sr-only` gives the outline its root and moves
        nothing on screen. The sibling dashboard pages carry the same h1 for
        the same reason; this is the only copy of the explanation.
      */}
      <h1 className="sr-only">{t(locale, "nav.dashboard")}</h1>
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
          which stays stable across locales.

          Sprint 4 Stream E (L-NEW-* family): the Nivo `axisLeft.legend`
          is now resolved from `axisLeftLegendKey` at render time, so
          DE/FR/ES users see their locale's axis label ("BEWERBUNGEN",
          "ZEIT VERBRACHT (Std.)", ...). The raw `axisLeftLegend`
          strings are kept as the backward-compatible fallback used
          when a future server component passes a dynamic axis label
          that does not live in a dictionary.
        */}
        <WeeklyBarChartToggle
          charts={[
            {
              label: "Jobs",
              labelKey: "dashboard.chartJobs",
              data: weeklyData,
              keys: ["value"],
              axisLeftLegend: "JOBS APPLIED",
              axisLeftLegendKey: "dashboard.chartJobsApplied",
            },
            {
              label: "Activities",
              labelKey: "dashboard.chartActivities",
              data: activitiesData,
              keys: activitiesDataKeys(activitiesData),
              groupMode: "stacked",
              axisLeftLegend: "TIME SPENT (Hours)",
              axisLeftLegendKey: "dashboard.chartTimeSpent",
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
