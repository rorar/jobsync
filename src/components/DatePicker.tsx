"use client";

import { addDays } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

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
}

export function DatePicker({
  field,
  presets,
  isEnabled,
  captionLayout,
}: DatePickerProps) {
  const { t, locale } = useTranslations();
  const [isPopoverOpen, setIsPopoverOpen] = useState<boolean>(false);

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            variant={"outline"}
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
          selected={field.value}
          onSelect={(value) => {
            field.onChange(value);
            setIsPopoverOpen(false);
          }}
          className="rounded-md border"
        />
      </PopoverContent>
    </Popover>
  );
}
