"use client";

import { memo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Banknote, Sparkles, Info } from "lucide-react";
import { CompanyLogo } from "@/components/ui/company-logo";
import { MatchScoreRing } from "./MatchScoreRing";
import { useTranslations, formatDateShort } from "@/i18n";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";
import type { ExitDirection } from "@/hooks/useDeckStack";

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

interface DeckCardProps {
  vacancy: StagedVacancyWithAutomation;
  exitDirection?: ExitDirection;
  isPreview?: boolean;
  previewLevel?: 1 | 2;
  onInfoClick?: (vacancy: StagedVacancyWithAutomation) => void;
}

function DeckCardInner({
  vacancy,
  exitDirection,
  isPreview = false,
  previewLevel = 1,
  onInfoClick,
}: DeckCardProps) {
  const { t, locale } = useTranslations();
  const [expanded, setExpanded] = useState(false);

  const animationClass = exitDirection
    ? exitDirection === "left"
      ? "animate-deck-exit-left"
      : exitDirection === "right"
        ? "animate-deck-exit-right"
        : exitDirection === "down"
          ? "animate-deck-exit-down"
          : "animate-deck-exit-up"
    : "";

  const previewClass = isPreview
    ? previewLevel === 1
      ? "absolute inset-x-0 top-2 scale-[0.95] opacity-50 dark:opacity-40 pointer-events-none z-0"
      : "absolute inset-x-0 top-4 scale-[0.90] opacity-25 dark:opacity-20 pointer-events-none z-[-1]"
    : "relative z-10";

  return (
    <div
      className={`
        w-full max-w-lg md:max-w-xl lg:max-w-2xl mx-auto rounded-xl shadow-lg dark:shadow-lg dark:shadow-black/20
        bg-card text-card-foreground border border-border overflow-hidden
        motion-reduce:!animate-none motion-reduce:!transition-none
        ${animationClass} ${previewClass}
      `}
    >
      {/* Header: Source badge + Info button + Match score */}
      <div className="px-5 pt-5 flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-xs" title={vacancy.sourceBoard}>
          {vacancy.sourceBoard}
        </Badge>
        <div className="flex items-center gap-1.5">
          {onInfoClick && !isPreview && (
            <button
              type="button"
              className="h-7 w-7 rounded-full bg-muted text-muted-foreground hover:bg-accent active:scale-90 flex items-center justify-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick(vacancy);
              }}
              aria-label={t("deck.detailsTooltip")}
              title={t("deck.detailsTooltip")}
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {vacancy.matchScore != null ? (
            <>
              <span className="text-xs text-muted-foreground sr-only">
                {t("deck.matchScore")}: {vacancy.matchScore}%
              </span>
              <MatchScoreRing score={vacancy.matchScore} />
            </>
          ) : (
            <Badge
              variant="secondary"
              className="text-xs inline-flex items-center gap-1 cursor-help"
              title={t("deck.noScoreHint")}
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              --
            </Badge>
          )}
        </div>
      </div>

      {/* Title + Employer */}
      <div className="px-5 pt-3">
        <h3 className="text-lg font-semibold leading-tight line-clamp-2 text-card-foreground">
          {vacancy.title}
        </h3>
        {vacancy.employerName && (
          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <CompanyLogo size="sm" companyName={vacancy.employerName} />
            {vacancy.employerName}
          </div>
        )}
      </div>

      {/* Meta row */}
      <div className="px-5 pt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        {vacancy.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {vacancy.location}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {formatDateShort(vacancy.discoveredAt, locale)}
        </span>
        {vacancy.salary && (
          <span className="inline-flex items-center gap-1">
            <Banknote className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {vacancy.salary}
          </span>
        )}
      </div>

      {/* Extended meta row */}
      {(
        (vacancy.positionOfferingCode && vacancy.positionOfferingCode !== "NS") ||
        vacancy.salaryMin != null ||
        vacancy.salaryMax != null ||
        (vacancy.requiredEducationLevel && vacancy.requiredEducationLevel !== "NS") ||
        vacancy.immediateStart ||
        (vacancy.numberOfPosts != null && vacancy.numberOfPosts > 1)
      ) && (
        <div className="px-5 pt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {vacancy.positionOfferingCode && vacancy.positionOfferingCode !== "NS" && (
            <Badge variant="outline" className="text-xs">
              {t(`deck.offering.${vacancy.positionOfferingCode}`)}
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
              {t(`deck.education.${vacancy.requiredEducationLevel}`)}
            </Badge>
          )}
          {vacancy.immediateStart && (
            <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              {t("deck.immediateStart")}
            </Badge>
          )}
          {vacancy.numberOfPosts != null && vacancy.numberOfPosts > 1 && (
            <span className="text-xs">
              {t("deck.positions").replace("{count}", String(vacancy.numberOfPosts))}
            </span>
          )}
        </div>
      )}

      {/* Description */}
      <div className="px-5 pt-3">
        {vacancy.description ? (
          <>
            <p
              className={`text-sm text-muted-foreground ${
                expanded ? "line-clamp-none max-h-48 overflow-y-auto" : "line-clamp-4 sm:line-clamp-4"
              }`}
            >
              {vacancy.description}
            </p>
            {vacancy.description.length > 200 && (
              <button
                type="button"
                className="text-sm font-medium text-primary cursor-pointer mt-1 min-h-[24px] py-0.5 inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? t("deck.showLess") : t("deck.showMore")}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {t("deck.noDescription")}
          </p>
        )}
      </div>

      {/* Automation source */}
      <div className="px-5 pt-2 pb-5">
        {vacancy.automation && (
          <p className="text-xs text-muted-foreground">
            {t("deck.viaAutomation").replace("{name}", vacancy.automation.name)}
          </p>
        )}
      </div>
    </div>
  );
}

export const DeckCard = memo(DeckCardInner);
