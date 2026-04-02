"use client";

import { Inbox } from "lucide-react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";

interface KanbanEmptyStateProps {
  onAddJob?: () => void;
}

export function KanbanEmptyState({ onAddJob }: KanbanEmptyStateProps) {
  const { t } = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 max-w-sm mx-auto text-center">
      <Inbox className="h-16 w-16 text-muted-foreground/40" aria-hidden="true" />
      <h3 className="text-lg font-medium mt-4">{t("jobs.kanbanEmptyBoard")}</h3>
      {onAddJob && (
        <Button variant="outline" className="mt-6" onClick={onAddJob}>
          {t("jobs.kanbanEmptyBoardAction")}
        </Button>
      )}
    </div>
  );
}
