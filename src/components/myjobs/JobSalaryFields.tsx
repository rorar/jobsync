"use client";

/**
 * JobSalaryFields — structured salary section of the Add/Edit Job form
 * (Welle 2 Phase 3, F-AJ-05). Encapsulates: range vs Fixum, currency, period,
 * and the flexible bonus. Reads/writes the react-hook-form values directly via
 * watch/setValue so the host form stays thin.
 *
 * Fixum: when `fixumDisablesRange` (user setting) is ON, a "Fixed salary" switch
 * collapses the range to a single amount (min == max) and hides the range
 * inputs. When OFF, min + max are always shown.
 */

import { useCallback, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { z } from "zod";
import type { AddJobFormSchema } from "@/models/addJobForm.schema";
import { useTranslations } from "@/i18n";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { CurrencySelect, type CurrencyOption } from "../ui/currency-select";
import type { BonusKind } from "@/lib/salary/bonus";

type JobFormValues = z.infer<typeof AddJobFormSchema>;

interface JobSalaryFieldsProps {
  form: UseFormReturn<JobFormValues>;
  currencies: CurrencyOption[];
  currenciesLoading?: boolean;
  /** User setting: entering a Fixum disables the range inputs (default true). */
  fixumDisablesRange: boolean;
  /**
   * Initial Fixum view, derived by the host from the loaded job (min === max).
   * Passed as a prop — NOT computed from a one-time `useState` initializer here —
   * because the form is reset asynchronously after mount; the host remounts this
   * component (via `key`) per edit target so this value is always current.
   */
  initialFixum?: boolean;
}

const NONE = "__none__";

/** Parse a numeric input into a non-negative number or null. */
function toAmount(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function JobSalaryFields({
  form,
  currencies,
  currenciesLoading,
  fixumDisablesRange,
  initialFixum = false,
}: JobSalaryFieldsProps) {
  const { t } = useTranslations();
  const { watch, setValue } = form;

  const salaryMin = watch("salaryMin") ?? null;
  const salaryMax = watch("salaryMax") ?? null;
  const salaryCurrency = watch("salaryCurrency") ?? "";
  const salaryPeriod = watch("salaryPeriod") ?? null;
  const bonus = watch("salaryBonus") ?? null;

  // Fixum mode is available only when the setting allows it. The host derives the
  // initial value from the loaded job (min === max) and remounts this component
  // per edit target, so a one-time initializer here is correct and race-free.
  const [fixumMode, setFixumMode] = useState<boolean>(initialFixum);

  const setNum = useCallback(
    (field: "salaryMin" | "salaryMax", raw: string) => {
      setValue(field, toAmount(raw), { shouldDirty: true });
    },
    [setValue],
  );

  // Fixum: one amount drives both bounds.
  const onFixumAmount = useCallback(
    (raw: string) => {
      const v = toAmount(raw);
      setValue("salaryMin", v, { shouldDirty: true });
      setValue("salaryMax", v, { shouldDirty: true });
    },
    [setValue],
  );

  const onToggleFixum = useCallback(
    (on: boolean) => {
      setFixumMode(on);
      if (on) {
        // Collapse to a single value: prefer the existing min.
        const v = salaryMin ?? salaryMax ?? null;
        setValue("salaryMin", v, { shouldDirty: true });
        setValue("salaryMax", v, { shouldDirty: true });
      }
    },
    [salaryMin, salaryMax, setValue],
  );

  // ----- Bonus -----
  const bonusKind: BonusKind | typeof NONE = bonus?.kind ?? NONE;
  const setBonusKind = useCallback(
    (value: string) => {
      if (value === NONE) {
        setValue("salaryBonus", null, { shouldDirty: true });
        return;
      }
      const kind = value as BonusKind;
      setValue(
        "salaryBonus",
        {
          kind,
          amount: kind === "percentage" ? null : (bonus?.amount ?? null),
          percentage: kind === "fixed" ? null : (bonus?.percentage ?? null),
          condition: bonus?.condition ?? null,
        },
        { shouldDirty: true },
      );
    },
    [bonus, setValue],
  );
  const patchBonus = useCallback(
    (patch: Partial<NonNullable<JobFormValues["salaryBonus"]>>) => {
      if (!bonus) return;
      setValue("salaryBonus", { ...bonus, ...patch }, { shouldDirty: true });
    },
    [bonus, setValue],
  );

  const showFixum = fixumDisablesRange && fixumMode;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{t("jobs.salary")}</Label>
        {fixumDisablesRange && (
          <div className="flex items-center gap-2">
            <Label htmlFor="salary-fixum" className="text-sm text-muted-foreground">
              {t("jobs.fixedSalary")}
            </Label>
            <Switch
              id="salary-fixum"
              checked={fixumMode}
              onCheckedChange={onToggleFixum}
              aria-label={t("jobs.fixedSalary")}
            />
          </div>
        )}
      </div>

      {/* Amounts: single (fixum) or min/max (range) */}
      {showFixum ? (
        <div className="space-y-1.5">
          <Label htmlFor="salary-fixum-amount">{t("jobs.salaryAmount")}</Label>
          <Input
            id="salary-fixum-amount"
            type="number"
            min={0}
            inputMode="numeric"
            value={salaryMin ?? ""}
            onChange={(e) => onFixumAmount(e.target.value)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="salary-min">{t("jobs.salaryMin")}</Label>
            <Input
              id="salary-min"
              type="number"
              min={0}
              inputMode="numeric"
              value={salaryMin ?? ""}
              onChange={(e) => setNum("salaryMin", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salary-max">{t("jobs.salaryMax")}</Label>
            <Input
              id="salary-max"
              type="number"
              min={0}
              inputMode="numeric"
              value={salaryMax ?? ""}
              onChange={(e) => setNum("salaryMax", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Currency + period */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="salary-currency">{t("jobs.salaryCurrency")}</Label>
          <CurrencySelect
            value={salaryCurrency}
            onValueChange={(code) => setValue("salaryCurrency", code || null, { shouldDirty: true })}
            currencies={currencies}
            loading={currenciesLoading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-period">{t("jobs.salaryPeriod")}</Label>
          <Select
            value={salaryPeriod ?? NONE}
            onValueChange={(v) =>
              setValue("salaryPeriod", v === NONE ? null : (v as JobFormValues["salaryPeriod"]), {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger id="salary-period" aria-label={t("jobs.salaryPeriod")}>
              <SelectValue placeholder={t("jobs.salaryPeriodNone")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("jobs.salaryPeriodNone")}</SelectItem>
              <SelectItem value="yearly">{t("jobs.salaryPeriodYearly")}</SelectItem>
              <SelectItem value="monthly">{t("jobs.salaryPeriodMonthly")}</SelectItem>
              <SelectItem value="hourly">{t("jobs.salaryPeriodHourly")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bonus */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="salary-bonus-kind">{t("jobs.bonus")}</Label>
          <Select value={bonusKind} onValueChange={setBonusKind}>
            <SelectTrigger id="salary-bonus-kind" aria-label={t("jobs.bonus")}>
              <SelectValue placeholder={t("jobs.bonusNone")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("jobs.bonusNone")}</SelectItem>
              <SelectItem value="fixed">{t("jobs.bonusFixed")}</SelectItem>
              <SelectItem value="percentage">{t("jobs.bonusPercentage")}</SelectItem>
              <SelectItem value="mixed">{t("jobs.bonusMixed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {bonus && (bonus.kind === "fixed" || bonus.kind === "mixed") && (
          <div className="space-y-1.5">
            <Label htmlFor="bonus-amount">{t("jobs.bonusAmount")}</Label>
            <Input
              id="bonus-amount"
              type="number"
              min={0}
              inputMode="numeric"
              value={bonus.amount ?? ""}
              onChange={(e) => patchBonus({ amount: toAmount(e.target.value) })}
            />
          </div>
        )}
        {bonus && (bonus.kind === "percentage" || bonus.kind === "mixed") && (
          <div className="space-y-1.5">
            <Label htmlFor="bonus-percentage">{t("jobs.bonusPercentage")}</Label>
            <Input
              id="bonus-percentage"
              type="number"
              min={0}
              inputMode="numeric"
              value={bonus.percentage ?? ""}
              onChange={(e) => patchBonus({ percentage: toAmount(e.target.value) })}
            />
          </div>
        )}
        {bonus && (
          <div className="space-y-1.5">
            <Label htmlFor="bonus-condition">{t("jobs.bonusCondition")}</Label>
            <Input
              id="bonus-condition"
              type="text"
              maxLength={200}
              value={bonus.condition ?? ""}
              placeholder={t("jobs.bonusConditionPlaceholder")}
              onChange={(e) => patchBonus({ condition: e.target.value || null })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default JobSalaryFields;
