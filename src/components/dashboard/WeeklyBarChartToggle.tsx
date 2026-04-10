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

/**
 * Chart configuration for the weekly bar chart.
 *
 * Sprint 3 Stream G (Sprint 2 follow-up) — added the optional `labelKey`
 * field to support localized chart labels.
 *
 * Historically the `label` field was a plain string (`"Jobs"`,
 * `"Activities"`) rendered directly in the toolbar radio-group AND in
 * the card title. That made the label frozen to whatever English text
 * the server component passed in, and DE/FR/ES users saw "Weekly Jobs"
 * instead of "Wöchentlich Jobs".
 *
 * The fix adds a parallel `labelKey` field. When set, the component
 * looks it up via `t(labelKey)` and uses the translation. When unset,
 * the legacy `label` string is used verbatim — this keeps the type
 * backward compatible so a future server component with a dynamic
 * category name (e.g. a custom chart tab) can still pass a raw string
 * without a registry entry.
 *
 * Consumers SHOULD migrate to `labelKey` for any fixed-vocabulary
 * label. The current consumer (`src/app/dashboard/page.tsx`) passes
 * the two known categories via `labelKey: "dashboard.chartJobs"` and
 * `labelKey: "dashboard.chartActivities"`.
 */
export type ChartConfig = {
  /**
   * Legacy plain-string label. Used as the visible label when
   * `labelKey` is not set. Also still used as an identity check below
   * for the Activities-only total-hours computation, so consumers
   * migrating to `labelKey` should keep this populated with a stable
   * internal identifier.
   */
  label: string;
  /**
   * Optional i18n key for the localized label. When set, takes
   * precedence over `label` for the visible text in the toolbar radio
   * group and the card title.
   */
  labelKey?: string;
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
 *
 * Sprint 3 Stream G (Sprint 2 follow-up): chart labels are now
 * localized via the optional `ChartConfig.labelKey` field, falling
 * back to the raw `label` string for backward compatibility.
 */
export default function WeeklyBarChartToggle({
  charts,
}: WeeklyBarChartToggleProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const current = charts[activeIndex];
  const { t, locale } = useTranslations();

  /**
   * Resolve a chart's visible label. Prefers the translated
   * `labelKey` when set; otherwise falls back to the raw `label`.
   * Centralized here so the toolbar options, the card title, and the
   * total-hours gate all agree on the same resolution rule.
   */
  const resolveLabel = (chart: ChartConfig): string =>
    chart.labelKey ? t(chart.labelKey) : chart.label;

  const roundedData = current.data.map((item) => {
    const newItem: any = { ...item };
    current.keys.forEach((key) => {
      if (typeof newItem[key] === "number") {
        newItem[key] = Math.round(newItem[key] * 100) / 100;
      }
    });
    return newItem;
  });

  /*
   * Keep the identity check on the raw `label` field, NOT on the
   * resolved (translated) label. The stable internal identifier
   * ("Activities") is what we're gating on — comparing against a
   * translated string would break when the user's locale is not
   * English. The resolved label is used ONLY for visible rendering.
   */
  const isActivitiesChart = current.label === "Activities";
  const totalHours = isActivitiesChart
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
    label: resolveLabel(chart),
  }));

  return (
    <Card className="mb-2 lg:mb-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-1 mt-3">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-green-600">
              {t("dashboard.weekly")} {resolveLabel(current)}
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
              isActivitiesChart
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
