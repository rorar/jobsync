"use client";

import { useState } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useTranslations } from "@/i18n";
import { formatDecimal } from "@/i18n";
import {
  ToolbarRadioGroup,
  type ToolbarRadioOption,
} from "@/components/ui/toolbar-radio-group";

type ChartConfig = {
  label: string;
  data: any[];
  keys: string[];
  groupMode?: "grouped" | "stacked";
  axisLeftLegend: string;
};

type WeeklyBarChartToggleProps = {
  charts: ChartConfig[];
};

/**
 * Sprint 2 Stream G (H-Y-07): migrated from a plain color-swap button
 * group (no ARIA semantics, no non-color indicator) to the shared
 * `ToolbarRadioGroup` primitive.
 */
export default function WeeklyBarChartToggle({
  charts,
}: WeeklyBarChartToggleProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const current = charts[activeIndex];
  const { t, locale } = useTranslations();

  const roundedData = current.data.map((item) => {
    const newItem: any = { ...item };
    current.keys.forEach((key) => {
      if (typeof newItem[key] === "number") {
        newItem[key] = Math.round(newItem[key] * 100) / 100;
      }
    });
    return newItem;
  });

  const totalHours =
    current.label === "Activities"
      ? roundedData.reduce(
          (sum, item) =>
            sum +
            current.keys.reduce(
              (keySum, key) =>
                keySum + (typeof item[key] === "number" ? item[key] : 0),
              0,
            ),
          0,
        )
      : null;

  const options: ToolbarRadioOption<string>[] = charts.map((chart, index) => ({
    value: String(index),
    // NOTE: Chart labels come from the server (e.g. "Activities", "Jobs") and
    // are not translated yet. Passing them through as-is preserves existing
    // behaviour — a follow-up task should add a translation lookup table.
    label: chart.label,
  }));

  return (
    <Card className="mb-2 lg:mb-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-1 mt-3">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-green-600">
              {t("dashboard.weekly")} {current.label}
            </CardTitle>
            {totalHours !== null && (
              <span className="text-sm text-muted-foreground">
                {formatDecimal(totalHours, locale, 1)} {t("dashboard.hrs")}
              </span>
            )}
          </div>
          <ToolbarRadioGroup<string>
            ariaLabel={t("dashboard.weekly")}
            value={String(activeIndex)}
            onChange={(next) => setActiveIndex(Number(next))}
            options={options}
            activeIndicatorTestId="weekly-chart-active-indicator"
          />
        </div>
      </CardHeader>

      <CardContent className="h-[240px] p-3 pt-1">
        <div className="h-[200px]">
          <ResponsiveBar
            data={roundedData}
            keys={current.keys}
            indexBy="day"
            margin={{
              top: 20,
              right: 10,
              bottom: 40,
              left: 45,
            }}
            padding={0.6}
            groupMode={current.groupMode}
            colors={
              current.groupMode === "stacked" ? { scheme: "nivo" } : "#2a7ef0"
            }
            enableTotals={current.groupMode === "stacked" ? true : false}
            valueFormat={(value) =>
              current.label === "Activities"
                ? formatDecimal(value, locale, 1)
                : formatDecimal(value, locale, 0)
            }
            theme={{
              text: {
                fill: "#9ca3af",
              },
              tooltip: {
                container: {
                  background: "#1e293b",
                  color: "#fff",
                },
              },
            }}
            axisTop={null}
            axisRight={null}
            enableGridX={false}
            enableGridY={false}
            enableLabel={true}
            labelTextColor={{
              from: "color",
              modifiers: [["darker", 1.6]],
            }}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legendPosition: "middle",
              legendOffset: 32,
              truncateTickAt: 0,
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: current.axisLeftLegend,
              legendPosition: "middle",
              legendOffset: -40,
              truncateTickAt: 0,
            }}
            motionConfig="gentle"
          />
        </div>
      </CardContent>
    </Card>
  );
}
