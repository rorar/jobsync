"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Building2,
  Calendar,
  ArrowUpCircle,
  XCircle,
  RotateCcw,
  Archive,
  Trash2,
} from "lucide-react";
import { useTranslations, formatDateShort } from "@/i18n";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

type ActiveTab = "new" | "dismissed" | "archive" | "trash";

interface StagedVacancyCardProps {
  vacancy: StagedVacancyWithAutomation;
  activeTab: ActiveTab;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onRestoreFromTrash: (id: string) => void;
  onPromote: (vacancy: StagedVacancyWithAutomation) => void;
}

export function StagedVacancyCard({
  vacancy,
  activeTab,
  selected = false,
  onToggleSelect,
  onDismiss,
  onRestore,
  onArchive,
  onTrash,
  onRestoreFromTrash,
  onPromote,
}: StagedVacancyCardProps) {
  const { t, locale } = useTranslations();

  return (
    <Card className={`mb-3 ${selected ? "ring-2 ring-primary/50" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            {onToggleSelect && (
              <input
                type="checkbox"
                className="h-4 w-4 mt-1 rounded border-input accent-primary shrink-0"
                checked={selected}
                onChange={() => onToggleSelect(vacancy.id)}
              />
            )}
            <CardTitle className="text-base font-medium leading-tight">
              {vacancy.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {vacancy.matchScore != null && (
              <Badge variant="secondary" className="text-xs">
                {t("staging.matchScore")} {vacancy.matchScore}%
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {vacancy.sourceBoard}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {vacancy.employerName && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {vacancy.employerName}
            </span>
          )}
          {vacancy.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {vacancy.location}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateShort(vacancy.discoveredAt, locale)}
          </span>
        </div>
        {vacancy.automation && (
          <div className="mt-1.5 text-xs text-muted-foreground">
            {t("staging.source")}: {vacancy.automation.name}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2 flex items-center gap-2 flex-wrap">
        {activeTab === "new" && (
          <>
            <Button
              size="sm"
              variant="default"
              className="h-7 gap-1 text-xs"
              onClick={() => onPromote(vacancy)}
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              {t("staging.promote")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => onDismiss(vacancy.id)}
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("staging.dismiss")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() => onArchive(vacancy.id)}
            >
              <Archive className="h-3.5 w-3.5" />
              {t("staging.archive")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-destructive"
              onClick={() => onTrash(vacancy.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("staging.trash")}
            </Button>
          </>
        )}
        {activeTab === "dismissed" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => onRestore(vacancy.id)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("staging.restore")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-destructive"
              onClick={() => onTrash(vacancy.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("staging.trash")}
            </Button>
          </>
        )}
        {activeTab === "archive" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => onRestore(vacancy.id)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("staging.restore")}
          </Button>
        )}
        {activeTab === "trash" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => onRestoreFromTrash(vacancy.id)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("staging.restore")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
