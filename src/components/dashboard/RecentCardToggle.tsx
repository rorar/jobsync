"use client";

import { useState } from "react";
import { CompanyLogo } from "@/components/ui/company-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations, formatDateShort } from "@/i18n";
import { JobResponse } from "@/models/job.model";
import Link from "next/link";
import {
  ToolbarRadioGroup,
  type ToolbarRadioOption,
} from "@/components/ui/toolbar-radio-group";

type RecentActivity = {
  id: string;
  activityName: string;
  duration: number | null;
  endTime: Date | null;
  activityType: { label: string } | null;
};

interface RecentCardToggleProps {
  jobs: JobResponse[];
  activities: RecentActivity[];
}

type RecentTab = "jobs" | "activities";

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return totalMinutes === 0 ? "0min" : `${hours}h ${minutes}min`;
}

/**
 * Sprint 2 Stream G (H-Y-07): migrated from a plain color-swap button
 * group (no ARIA semantics, no non-color indicator) to the shared
 * `ToolbarRadioGroup` primitive. Screen readers now announce the
 * radiogroup purpose + selected option, and sighted users get the
 * Check glyph in addition to the background colour change (WCAG 1.4.1).
 */
export default function RecentCardToggle({
  jobs,
  activities,
}: RecentCardToggleProps) {
  const [activeTab, setActiveTab] = useState<RecentTab>("jobs");
  const { t, locale } = useTranslations();

  const jobsLabel = t("dashboard.jobs");
  const activitiesLabel = t("dashboard.activities");

  const options: ToolbarRadioOption<RecentTab>[] = [
    { value: "jobs", label: jobsLabel },
    { value: "activities", label: activitiesLabel },
  ];

  const currentLabel = activeTab === "jobs" ? jobsLabel : activitiesLabel;

  return (
    <Card className="mb-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-green-600">
            {t("dashboard.recent")} {currentLabel}
          </CardTitle>
          <ToolbarRadioGroup<RecentTab>
            ariaLabel={t("dashboard.recent")}
            value={activeTab}
            onChange={setActiveTab}
            options={options}
            activeIndicatorTestId="recent-card-active-indicator"
          />
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        {activeTab === "jobs"
          ? jobs.map((job) => (
              <div key={job.id} className="flex items-center gap-4">
                <div className="hidden sm:flex">
                  <CompanyLogo
                    logoUrl={job.Company?.logoUrl}
                    logoAssetId={job.Company?.logoAssetId}
                    companyName={job.Company?.label || "?"}
                    size="md"
                  />
                </div>
                <Link href={`/dashboard/myjobs/${job?.id}`}>
                  <div className="grid gap-1">
                    <p className="text-sm font-medium leading-none">
                      {job.JobTitle?.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {job.Company?.label}
                    </p>
                  </div>
                </Link>
                <div className="ml-auto text-sm font-medium">
                  {job?.appliedDate ? formatDateShort(job.appliedDate, locale) : t("dashboard.na")}
                </div>
              </div>
            ))
          : activities.map((activity) => (
              <div key={activity.id} className="flex items-center gap-4">
                <div className="grid gap-1 min-w-0 flex-1">
                  <p className="text-sm font-medium leading-none truncate">
                    {activity.activityName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {activity.activityType?.label || t("dashboard.unknown")}
                  </p>
                </div>
                <div className="ml-auto text-right shrink-0">
                  <p className="text-sm font-medium">
                    {formatDuration(activity.duration ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activity.endTime ? formatDateShort(activity.endTime, locale) : ""}
                  </p>
                </div>
              </div>
            ))}
      </CardContent>
    </Card>
  );
}
