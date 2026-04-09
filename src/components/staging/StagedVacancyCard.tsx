"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Calendar,
  Banknote,
  ArrowUpCircle,
  XCircle,
  RotateCcw,
  Archive,
  Trash2,
  Ban,
  Info,
} from "lucide-react";
import { CompanyLogo } from "@/components/ui/company-logo";
import { useTranslations, formatDateShort } from "@/i18n";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
  period: string | null | undefined,
): string {
  const cur = currency ?? "EUR";
  const fmt = (n: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(n);
  const parts: string[] = [];
  if (min != null && max != null && min !== max) {
    parts.push(`${fmt(min)} – ${fmt(max)}`);
  } else if (min != null) {
    parts.push(`ab ${fmt(min)}`);
  } else if (max != null) {
    parts.push(`bis ${fmt(max)}`);
  }
  if (period && period !== "NS") {
    parts.push(`/${period}`);
  }
  return parts.join(" ") || "";
}

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
  onBlockCompany?: (companyName: string) => void;
  onOpenDetails?: (vacancy: StagedVacancyWithAutomation) => void;
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
  onBlockCompany,
  onOpenDetails,
}: StagedVacancyCardProps) {
  const { t, locale } = useTranslations();

  // Sprint 2 H-T-06: the previous `handleBodyClick` + `role="presentation"`
  // wrapper made the card body a mouse-only entry point — a keyboard user
  // could not open the details sheet from the body itself (only via the
  // Details button in the footer, which is fine, but axe flagged the body
  // wrapper as `click-events-have-key-events`). Two refactor options were
  // considered:
  //
  //   (a) Convert the wrapper to `role="button"` with `tabIndex={0}` and
  //       Enter/Space handling. Rejected: the wrapper contains interactive
  //       children (checkbox, Details/Promote/Dismiss/.../Block buttons),
  //       which makes it a nested interactive element — invalid ARIA,
  //       violates WCAG 4.1.2 Name/Role/Value, and causes screen readers
  //       to announce the whole card as "button: Senior Software Engineer
  //       ... Promote button Dismiss button" in a single blob.
  //
  //   (b) Keep the wrapper as `role="presentation"` and add a native
  //       `<button>` overlay. Same nested-interactive problem; the overlay
  //       would swallow clicks intended for the footer buttons.
  //
  //   (c) Remove the body click-to-open entirely and rely on the Details
  //       button as the sole explicit entry point (already present in the
  //       footer with a per-vacancy aria-label). Picked: preserves the
  //       visual design, matches keyboard users' expectations, and avoids
  //       ANY nested-interactive trap.
  //
  // The hover/cursor feedback is moved to the Details button itself —
  // the card still renders as a visual unit, just without a click handler
  // on the body wrapper. This is the skill's "simplicity over cleverness"
  // principle: one obvious entry point beats two overlapping ones.
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
                onClick={(e) => e.stopPropagation()}
                aria-label={`${t("staging.selectVacancy")}: ${vacancy.title}`}
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
            <div className="inline-flex items-center gap-1.5">
              <CompanyLogo size="sm" companyName={vacancy.employerName} />
              {vacancy.employerName}
            </div>
          )}
          {vacancy.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {vacancy.location}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDateShort(vacancy.discoveredAt, locale)}
          </span>
        </div>
        {vacancy.automation && (
          <div className="mt-1.5 text-xs text-muted-foreground">
            {t("staging.source")}: {vacancy.automation.name}
          </div>
        )}
        {/* Extended meta badges */}
        {(
          (vacancy.positionOfferingCode && vacancy.positionOfferingCode !== "NS") ||
          vacancy.salaryMin != null ||
          vacancy.salaryMax != null ||
          (vacancy.requiredEducationLevel && vacancy.requiredEducationLevel !== "NS") ||
          vacancy.immediateStart ||
          (vacancy.numberOfPosts != null && vacancy.numberOfPosts > 1)
        ) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {vacancy.positionOfferingCode && vacancy.positionOfferingCode !== "NS" && (
              <Badge variant="outline" className="text-xs">
                {t(`staging.offering.${vacancy.positionOfferingCode}`)}
              </Badge>
            )}
            {(vacancy.salaryMin != null || vacancy.salaryMax != null) && (
              <span className="inline-flex items-center gap-1">
                <Banknote className="h-3 w-3 shrink-0" aria-hidden="true" />
                {formatSalaryRange(vacancy.salaryMin, vacancy.salaryMax, vacancy.salaryCurrency, vacancy.salaryPeriod)}
              </span>
            )}
            {vacancy.requiredEducationLevel && vacancy.requiredEducationLevel !== "NS" && (
              <Badge variant="outline" className="text-xs">
                {t(`staging.education.${vacancy.requiredEducationLevel}`)}
              </Badge>
            )}
            {vacancy.immediateStart && (
              <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                {t("staging.immediateStart")}
              </Badge>
            )}
            {vacancy.numberOfPosts != null && vacancy.numberOfPosts > 1 && (
              <span className="text-xs">
                {t("staging.positions").replace("{count}", String(vacancy.numberOfPosts))}
              </span>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2 flex items-center gap-2 flex-wrap">
        {/*
          Sprint 2 H-NEW-04: every footer button now carries a per-vacancy
          accessible name built from `vacancyContext`. Previously only the
          Details button threaded the vacancy title through `aria-label`;
          Promote / Dismiss / Archive / Trash / Block / Restore rendered
          only their generic verb text, producing a screen-reader stream of
          "Promote button; Dismiss button; Archive button; ..." across 20
          cards — WCAG 2.4.6 / 4.1.2 violation. The context string includes
          the vacancy title AND the employer name when present, so users
          can disambiguate between "Promote: Senior Engineer at TechCorp"
          and "Promote: Senior Engineer at Another Co". Visible button
          text is unchanged; the override only affects accessible names.
        */}
        {(() => {
          const vacancyContext = vacancy.employerName
            ? `${vacancy.title} — ${vacancy.employerName}`
            : vacancy.title;
          return (
            <>
              {onOpenDetails && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={() => onOpenDetails(vacancy)}
                  aria-label={`${t("staging.details")}: ${vacancyContext}`}
                >
                  <Info className="h-3.5 w-3.5" />
                  {t("staging.details")}
                </Button>
              )}
              {activeTab === "new" && (
                <>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 gap-1 text-xs"
                    onClick={() => onPromote(vacancy)}
                    aria-label={`${t("staging.promote")}: ${vacancyContext}`}
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                    {t("staging.promote")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => onDismiss(vacancy.id)}
                    aria-label={`${t("staging.dismiss")}: ${vacancyContext}`}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {t("staging.dismiss")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={() => onArchive(vacancy.id)}
                    aria-label={`${t("staging.archive")}: ${vacancyContext}`}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {t("staging.archive")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs text-destructive"
                    onClick={() => onTrash(vacancy.id)}
                    aria-label={`${t("staging.trash")}: ${vacancyContext}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("staging.trash")}
                  </Button>
                  {onBlockCompany && vacancy.employerName && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => onBlockCompany(vacancy.employerName!)}
                      aria-label={`${t("blacklist.blockCompany")}: ${vacancy.employerName}`}
                    >
                      <Ban className="h-3.5 w-3.5" />
                      {t("blacklist.blockCompany")}
                    </Button>
                  )}
                </>
              )}
              {activeTab === "dismissed" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => onRestore(vacancy.id)}
                    aria-label={`${t("staging.restore")}: ${vacancyContext}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("staging.restore")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs text-destructive"
                    onClick={() => onTrash(vacancy.id)}
                    aria-label={`${t("staging.trash")}: ${vacancyContext}`}
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
                  aria-label={`${t("staging.restore")}: ${vacancyContext}`}
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
                  aria-label={`${t("staging.restore")}: ${vacancyContext}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("staging.restore")}
                </Button>
              )}
            </>
          );
        })()}
      </CardFooter>
    </Card>
  );
}
