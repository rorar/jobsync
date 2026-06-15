"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { FormControl } from "./ui/form";
import { ControllerRenderProps } from "react-hook-form";
import { useTranslations } from "@/i18n";

interface SelectProps {
  label: string;
  options: any[];
  field: ControllerRenderProps<any, any>;
  disabled?: boolean;
}

function SelectFormCtrl({ label, options, field, disabled }: SelectProps) {
  const { t } = useTranslations();
  const selectPlaceholder = t("forms.selectPlaceholder").replace("{label}", label);
  return (
    <>
      <Select
        onValueChange={field.onChange}
        value={field.value}
        name={field.name}
        disabled={disabled}
      >
        <FormControl>
          <SelectTrigger aria-label={selectPlaceholder} className="w-[200px]">
            <SelectValue placeholder={selectPlaceholder} />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          <SelectGroup>
            {options &&
              options.map((option) => {
                return (
                  <SelectItem
                    key={option.id}
                    value={option.id}
                    className="capitalize"
                  >
                    {option.label ?? option.value ?? option.title}
                  </SelectItem>
                );
              })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}

export default SelectFormCtrl;
