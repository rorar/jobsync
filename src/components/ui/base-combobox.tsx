"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronsUpDown } from "lucide-react";

/**
 * BaseCombobox — shared headless wrapper for all combobox variants.
 *
 * Provides the common Popover + Command + trigger button shell.
 * Callers render their own CommandGroup / CommandItem trees via `children`.
 *
 * This is the Layer 2 component described in the C4 ComboBox analysis
 * (docs/architecture/c4-component-combobox.md). It extracts the duplicated
 * Popover + trigger + input boilerplate so that specialised variants
 * (Combobox, TagInput, EuresLocationCombobox, EuresOccupationCombobox)
 * can adopt it as their outer shell.
 *
 * NOTE: Not consumed by anything yet — and never has been. This line used to
 * claim the generic Combobox consumed it; that was false on the day it was
 * written, including in the commit that created this file. `git log --all -S`
 * over src/ finds no import of it in any commit on any local branch.
 *
 * The control users actually see is `Combobox` in src/components/ComboBox.tsx,
 * which implements the selection, creation and keyboard rules independently.
 * This file is the intended target of the combobox consolidation deferred as
 * ADR-038 section G — see docs/inside-track-implementation-debt.md:185-190,
 * which also records why adoption must be one cross-cutting pass rather than
 * incremental: BaseCombobox still lacks a trigger aria-label, an aria-live
 * announce, a loading slot and overridable width, so migrating variants one at
 * a time would regress accessibility.
 *
 * Consequences of the name having outrun the code are catalogued in
 * docs/knip-unused-ui-primitives.md section 5, including an a11y finding
 * (WEED-1) that was raised against, and "fixed" in, this file while the live
 * trigger had carried both attributes for six days.
 */

export interface BaseComboboxProps {
  /** Text shown on the trigger button when nothing is selected */
  triggerLabel: string;
  /** Optional override for trigger button content (e.g. selected value label) */
  triggerContent?: React.ReactNode;
  /** CommandInput placeholder */
  placeholder?: string;
  /** Controlled open state */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Controlled search input value */
  inputValue: string;
  /** Callback when search input changes */
  onInputValueChange: (value: string) => void;
  /** Custom filter function for Command */
  filter?: (value: string, search: string) => number;
  /** Whether the trigger is disabled */
  disabled?: boolean;
  /** Optional trailing icon override for the trigger button */
  triggerIcon?: React.ReactNode;
  /** Additional className for the trigger button */
  triggerClassName?: string;
  /** Additional className for the popover content */
  contentClassName?: string;
  /** Children rendered inside the Command (CommandGroup, CommandEmpty, etc.) */
  children: React.ReactNode;
}

export function BaseCombobox({
  triggerLabel,
  triggerContent,
  placeholder,
  open,
  onOpenChange,
  inputValue,
  onInputValueChange,
  filter,
  disabled,
  triggerIcon,
  triggerClassName,
  contentClassName,
  children,
}: BaseComboboxProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          type="button"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "md:w-[240px] lg:w-[280px] justify-between capitalize",
            triggerClassName
          )}
        >
          {triggerContent ?? (
            <span className="text-muted-foreground">{triggerLabel}</span>
          )}
          {triggerIcon ?? (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("md:w-[240px] lg:w-[280px] p-0", contentClassName)}
      >
        <Command filter={filter}>
          <CommandInput
            value={inputValue}
            onValueChange={onInputValueChange}
            placeholder={placeholder}
          />
          <CommandList>{children}</CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
