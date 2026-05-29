"use client";

import { CalendarDays, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "@/i18n";
import type { PersonHolidayInfo } from "@/actions/reference-data.actions";

interface HolidayBadgeProps {
  info: PersonHolidayInfo | null;
}

/**
 * Contextual badge for a contact's country: public holiday (amber) or weekend
 * (blue) on the current date. Renders nothing for a plain business day or when
 * info is absent. The wrapper is a polite live region because the badge appears
 * asynchronously after the holiday lookup resolves.
 *
 * NOTE: `$` in interpolated values is safe — the substring after `.replace`'s
 * matched token is treated literally only for the SECOND arg; holiday names from
 * date-holidays are verified `$`-free for our supported countries.
 */
export function HolidayBadge({ info }: HolidayBadgeProps) {
  const { t } = useTranslations();

  if (!info || (!info.isHoliday && !info.isWeekend)) return null;

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm">
      {info.isHoliday ? (
        <>
          <CalendarDays className="h-4 w-4 text-amber-500" />
          <Badge
            variant="outline"
            className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600"
          >
            {t("crm.holidayToday")
              .replace("{country}", info.countryName)
              .replace("{name}", info.holidayName ?? "")}
          </Badge>
        </>
      ) : (
        <>
          <Sun className="h-4 w-4 text-blue-500" />
          <Badge
            variant="outline"
            className="text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-600"
          >
            {t("crm.weekendToday").replace("{country}", info.countryName)}
          </Badge>
        </>
      )}
    </div>
  );
}
