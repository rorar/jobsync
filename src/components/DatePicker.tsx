"use client";

import { addDays } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslations, formatDateShort } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ControllerRenderProps } from "react-hook-form";
import { useState } from "react";
import { FormControl } from "./ui/form";

interface DatePickerProps {
  field: ControllerRenderProps<any, any>;
  presets: boolean;
  isEnabled: boolean;
  captionLayout?: boolean;
  /** When true, render a "Clear" action that resets the value to undefined. */
  allowClear?: boolean;
  /** Optional test id on the trigger button (for E2E targeting). */
  triggerTestId?: string;
}

export function DatePicker({
  field,
  presets,
  isEnabled,
  captionLayout,
  allowClear = false,
  triggerTestId,
}: DatePickerProps) {
  const { t, locale } = useTranslations();
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);
  // Clear with `null`, NOT `undefined`: react-hook-form 7.x ignores `undefined`
  // in onChange/setValue (the Controller keeps the prior value and the trigger
  // never reverts to the placeholder). `null` is a defined falsy value that does
  // re-render. The form schema accepts null (.nullable()) and the action coerces
  // null -> DB null.
  const clearValue = () => {
    field.onChange(null);
    setIsPopoverOpen(false);
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant={"outline"}
            data-testid={triggerTestId}
            className={cn(
              "md:w-[240px] lg:w-[280px] justify-start text-left font-normal",
              !field.value && "text-muted-foreground"
            )}
            disabled={!isEnabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {field.value ? formatDateShort(field.value, locale) : <span>{t("jobs.pickADate")}</span>}
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col space-y-2 p-2">
        {presets && (
          <Select
            onValueChange={(value) => {
              field.onChange(addDays(new Date(), parseInt(value)));
              setIsPopoverOpen(false);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("jobs.selectPreset")} />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="0">{t("jobs.presetToday")}</SelectItem>
              <SelectItem value="1">{t("jobs.presetTomorrow")}</SelectItem>
              <SelectItem value="3">{t("jobs.presetIn3Days")}</SelectItem>
              <SelectItem value="7">{t("jobs.presetInAWeek")}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Calendar
          mode="single"
          captionLayout={captionLayout ? "dropdown" : "label"}
          startMonth={captionLayout ? new Date(1970, 0) : undefined}
          endMonth={captionLayout ? new Date() : undefined}
          selected={field.value ?? undefined}
          onSelect={(value) => {
            field.onChange(value);
            setIsPopoverOpen(false);
          }}
          className="rounded-md border"
        />
        {allowClear && field.value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={clearValue}
          >
            <X className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("jobs.clearDate")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
