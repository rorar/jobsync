"use client";

/**
 * StatusStageCombobox (Welle 4, F-AJ-02).
 *
 * Status picker grouped by STAGE (category), used in the job form. Replaces the
 * flat SelectFormCtrl status dropdown AND folds in the former separate "applied"
 * Switch: choosing an applied-stage status drives Job.applied (the parent derives
 * it from the selected status' category). Each option surfaces a "marks applied"
 * hint inline so applied-ness is communicated by TEXT, never colour alone (WCAG).
 *
 * Built on the same Popover + cmdk primitives as Combobox, with manual filtering
 * (shouldFilter={false}) and an aria-live selection announcement (the
 * EuresLocationCombobox a11y pattern).
 */

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { JobStatus } from "@/models/job.model";
import { stageColorVar } from "@/lib/crm/stage-colors";

interface StatusStageComboboxProps {
  options: JobStatus[];
  /** Selected status id. */
  value?: string;
  onChange: (statusId: string) => void;
  disabled?: boolean;
}

interface StageGroup {
  categoryId: string;
  kind: string;
  colour: string;
  sortOrder: number;
  isAppliedStage: boolean;
  statuses: JobStatus[];
}

export function StatusStageCombobox({
  options,
  value,
  onChange,
  disabled,
}: StatusStageComboboxProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const selected = options.find((o) => o.id === value);

  const stageLabel = (kind: string) => t(`jobStatus.stage.${kind}` as never);

  // Group statuses by stage, preserving the (category.sortOrder, status.sortOrder)
  // order the Repository already applied. Falls back to a single group when a
  // payload lacks category data.
  const groups = useMemo<StageGroup[]>(() => {
    const byId = new Map<string, StageGroup>();
    const order: string[] = [];
    for (const s of options) {
      const cat = s.category;
      const key = cat?.id ?? "__ungrouped__";
      if (!byId.has(key)) {
        byId.set(key, {
          categoryId: key,
          kind: cat?.kind ?? "",
          colour: cat?.colour ?? "gray",
          sortOrder: cat?.sortOrder ?? 0,
          isAppliedStage: cat?.isAppliedStage ?? false,
          statuses: [],
        });
        order.push(key);
      }
      byId.get(key)!.statuses.push(s);
    }
    const q = query.trim().toLowerCase();
    return order
      .map((k) => byId.get(k)!)
      .map((g) =>
        q ? { ...g, statuses: g.statuses.filter((s) => s.label.toLowerCase().includes(q)) } : g,
      )
      .filter((g) => g.statuses.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [options, query]);

  const selectStatus = (status: JobStatus) => {
    onChange(status.id);
    setOpen(false);
    setQuery("");
    setAnnouncement(
      status.category?.isAppliedStage
        ? t("jobStatus.selectedAppliedAnnouncement").replace("{label}", status.label)
        : t("jobStatus.selectedAnnouncement").replace("{label}", status.label),
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          type="button"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-10 w-[200px] justify-between", !selected && "text-muted-foreground")}
          data-testid="status-combobox-trigger"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.category && (
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ ...stageColorVar(selected.category.colour), backgroundColor: "var(--stage-color)" }}
              />
            )}
            <span className="truncate">{selected ? selected.label : t("jobStatus.selectStatus")}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("jobStatus.searchStatus")}
          />
          <CommandList>
            <CommandEmpty>{t("forms.noResults")}</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.categoryId} heading={g.kind ? stageLabel(g.kind) : undefined}>
                {g.statuses.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onSelect={() => selectStatus(s)}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn("h-4 w-4 shrink-0", s.id === value ? "opacity-100" : "opacity-0")}
                    />
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ ...stageColorVar(g.colour), backgroundColor: "var(--stage-color)" }}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    {g.isAppliedStage && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t("jobStatus.marksApplied")}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </Popover>
  );
}
