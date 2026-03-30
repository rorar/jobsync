"use client";

import Link from "next/link";
import { useSchedulerStatus } from "@/hooks/use-scheduler-status";
import { useTranslations } from "@/i18n";
import { AlertCircle } from "lucide-react";

interface ModuleBusyBannerProps {
  automationId: string;
  moduleId: string;
}

export function ModuleBusyBanner({ automationId, moduleId }: ModuleBusyBannerProps) {
  const { t } = useTranslations();
  const { getModuleBusy } = useSchedulerStatus();

  const otherBusy = getModuleBusy(moduleId).filter(
    (lock) => lock.automationId !== automationId,
  );

  if (otherBusy.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        {t("automations.moduleBusy")}:{" "}
        {otherBusy.map((l, i) => (
          <span key={l.automationId}>
            {i > 0 && ", "}
            <Link href={`/dashboard/automations/${l.automationId}`} className="underline hover:text-foreground">
              {l.automationName}
            </Link>
          </span>
        ))}
      </p>
    </div>
  );
}
