"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building2, Calendar, Banknote } from "lucide-react";
import { useTranslations, formatDateShort } from "@/i18n";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";
import type { ExitDirection } from "@/hooks/useDeckStack";

interface DeckCardProps {
  vacancy: StagedVacancyWithAutomation;
  exitDirection?: ExitDirection;
  isPreview?: boolean;
  previewLevel?: 1 | 2;
}

function MatchScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 16; // r=16
  const filled = (score / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 80) return "text-emerald-500 dark:text-emerald-400";
    if (s >= 60) return "text-blue-500 dark:text-blue-400";
    if (s >= 40) return "text-amber-700 dark:text-amber-400";
    return "text-red-500 dark:text-red-400";
  };

  const getStrokeColor = (s: number) => {
    if (s >= 80) return "stroke-emerald-500 dark:stroke-emerald-400";
    if (s >= 60) return "stroke-blue-500 dark:stroke-blue-400";
    if (s >= 40) return "stroke-amber-500 dark:stroke-amber-400";
    return "stroke-red-500 dark:stroke-red-400";
  };

  return (
    <svg viewBox="0 0 40 40" className="h-11 w-11" aria-hidden="true">
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="none"
        className="stroke-muted"
        strokeWidth="3"
      />
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="none"
        className={getStrokeColor(score)}
        strokeWidth="3"
        strokeDasharray={`${filled} ${circumference}`}
        strokeDashoffset="0"
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text
        x="20"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        className={`text-[11px] font-semibold fill-current ${getColor(score)}`}
      >
        {score}
      </text>
    </svg>
  );
}

export function DeckCard({
  vacancy,
  exitDirection,
  isPreview = false,
  previewLevel = 1,
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
      {/* Header: Source badge + Match score */}
      <div className="px-5 pt-5 flex items-center justify-between">
        <Badge variant="outline" className="text-xs">
          {vacancy.sourceBoard}
        </Badge>
        {vacancy.matchScore != null ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground sr-only">
              {t("deck.matchScore")}: {vacancy.matchScore}%
            </span>
            <MatchScoreRing score={vacancy.matchScore} />
          </div>
        ) : (
          <Badge variant="secondary" className="text-xs">
            {t("common.na")}
          </Badge>
        )}
      </div>

      {/* Title + Employer */}
      <div className="px-5 pt-3">
        <h3 className="text-lg font-semibold leading-tight line-clamp-2 text-card-foreground">
          {vacancy.title}
        </h3>
        {vacancy.employerName && (
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {vacancy.employerName}
          </p>
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
