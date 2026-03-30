"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslations, formatRelativeTime } from "@/i18n";

interface ConflictWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProceed: () => void;
  type: "blocked" | "contention";
  conflictDetails: {
    automationName?: string;
    runSource?: string;
    startedAt?: Date;
    moduleId?: string;
    otherAutomations?: string[];
  };
}

export function ConflictWarningDialog({
  open,
  onOpenChange,
  onProceed,
  type,
  conflictDetails,
}: ConflictWarningDialogProps) {
  const { t, locale } = useTranslations();

  const isBlocked = type === "blocked";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isBlocked
              ? t("automations.conflictBlocked")
              : t("automations.conflictContention")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                {isBlocked
                  ? t("automations.conflictBlockedDesc")
                  : t("automations.conflictContentionDesc")}
              </p>

              {isBlocked && (
                <div className="rounded-md border bg-muted/50 p-3 text-sm space-y-1">
                  {conflictDetails.automationName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("automations.automationName")}
                      </span>
                      <span className="font-medium text-foreground">
                        {conflictDetails.automationName}
                      </span>
                    </div>
                  )}
                  {conflictDetails.runSource && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("automations.conflictSource")}
                      </span>
                      <span className="font-medium text-foreground">
                        {conflictDetails.runSource === "scheduler"
                          ? t("automations.runSourceScheduler")
                          : t("automations.runSourceManual")}
                      </span>
                    </div>
                  )}
                  {conflictDetails.startedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("automations.conflictStartedAt")}
                      </span>
                      <span className="font-medium text-foreground">
                        {formatRelativeTime(conflictDetails.startedAt, locale)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!isBlocked && conflictDetails.otherAutomations && (
                <div className="rounded-md border bg-muted/50 p-3 text-sm space-y-1">
                  {conflictDetails.moduleId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("automations.schedulerModule")}
                      </span>
                      <span className="font-medium text-foreground capitalize">
                        {conflictDetails.moduleId}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">
                      {t("automations.schedulerActive")}:
                    </span>
                    <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                      {conflictDetails.otherAutomations.map((name) => (
                        <li
                          key={name}
                          className="text-foreground font-medium"
                        >
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("automations.conflictCancel")}
          </AlertDialogCancel>
          {!isBlocked && (
            <AlertDialogAction onClick={onProceed}>
              {t("automations.conflictProceed")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
