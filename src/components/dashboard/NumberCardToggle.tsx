"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTranslations } from "@/i18n";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  ToolbarRadioGroup,
  type ToolbarRadioOption,
} from "@/components/ui/toolbar-radio-group";

interface NumberCardToggleProps {
  data: {
    label: string;
    num: number;
    trend: number;
  }[];
}

// Map English period labels from server to i18n keys
const periodLabelKeys: Record<string, string> = {
  "Last 7 days": "dashboard.period7Days",
  "Last 30 days": "dashboard.period30Days",
};

/**
 * Sprint 2 Stream G (H-Y-07): migrated from a plain color-swap button
 * group (no ARIA semantics, no non-color indicator) to the shared
 * `ToolbarRadioGroup` primitive.
 */
export default function NumberCardToggle({ data }: NumberCardToggleProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const current = data[activeIndex];
  const { t } = useTranslations();

  const options: ToolbarRadioOption<string>[] = data.map((item, index) => ({
    // Index-backed value keeps state stable even if two periods share a label.
    value: String(index),
    label: periodLabelKeys[item.label] ? t(periodLabelKeys[item.label]) : item.label,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-end">
          <ToolbarRadioGroup<string>
            ariaLabel={t("dashboard.jobsApplied")}
            value={String(activeIndex)}
            onChange={(next) => setActiveIndex(Number(next))}
            options={options}
            activeIndicatorTestId="number-card-active-indicator"
          />
        </div>
        <CardTitle className="text-4xl">
          {current.num}{" "}
          <span className="text-xs text-muted-foreground">{t("dashboard.jobsApplied")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 text-xs text-muted-foreground">
          {current.trend}%{" "}
          {current.trend > 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Progress
          value={current.trend}
          aria-label={`${current.trend}% ${current.trend >= 0 ? "increase" : "decrease"}`}
        />
      </CardFooter>
    </Card>
  );
}
