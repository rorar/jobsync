"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface SubdivisionOption {
  code: string;
  name: string;
  subdivisionType: string | null;
}

interface SubdivisionSelectProps {
  value: string;
  onValueChange: (code: string) => void;
  subdivisions: SubdivisionOption[];
  disabled?: boolean;
  className?: string;
}

export function SubdivisionSelect({
  value,
  onValueChange,
  subdivisions,
  disabled,
  className,
}: SubdivisionSelectProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);

  const selectedSub = useMemo(
    () => subdivisions.find((s) => s.code === value),
    [subdivisions, value],
  );

  if (subdivisions.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t("crm.subdivisionSelect")}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selectedSub ? (
            <span className="truncate">{selectedSub.name}</span>
          ) : (
            <span className="text-muted-foreground">
              {t("crm.subdivisionSelect")}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={t("crm.subdivisionSearch")}
            onKeyDown={(e) => { if (e.key === "Tab") setOpen(false); }}
          />
          <CommandList>
            <CommandEmpty>{t("crm.noSubdivisionFound")}</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  — {t("crm.subdivisionSelect")}
                </CommandItem>
              )}
              {subdivisions.map((s) => (
                <CommandItem
                  key={s.code}
                  value={`${s.name} ${s.code}`}
                  onSelect={() => {
                    onValueChange(s.code);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.code === value && (
                    <Check className="ml-2 h-4 w-4 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
