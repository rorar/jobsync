"use client";

import { useTranslations } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Colored badge for a Referral lifecycle state.
 * SoT: specs/inside-track.allium `status` (open→engaged→relayed→in_review→
 * converted | declined | stale).
 *
 * WCAG 1.4.1: colour is NEVER the sole signal — the translated label is always
 * rendered. `data-status` is a styling/test hook, not the accessible name.
 */
const STATUS_CLASS: Record<string, string> = {
  open: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  engaged:
    "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  relayed:
    "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200",
  in_review:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  converted:
    "border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  declined:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  stale:
    "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200",
};

export function ReferralStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const { t } = useTranslations();
  return (
    <Badge
      variant="outline"
      data-status={status}
      className={cn(STATUS_CLASS[status] ?? "", className)}
    >
      {t(`insideTrack.status.${status}`)}
    </Badge>
  );
}
