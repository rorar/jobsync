"use client";

import {
  Building2,
  Calendar,
  CalendarClock,
  Clock,
  ExternalLink,
  GraduationCap,
  Languages,
  MapPin,
  Banknote,
  Briefcase,
  Globe2,
  Hash,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "@/components/ui/company-logo";
import { MatchScoreRing } from "./MatchScoreRing";
import { useTranslations, formatDateShort } from "@/i18n";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";
// HIGH-P2B-01 (Sprint 4 full-review): the local `formatSalaryRange` copy
// was extracted to `src/lib/staging/format-salary-range.ts` as the single
// source of truth. All three staging card/detail surfaces now share the
// same locale-aware per-(locale, currency) formatter cache.
import { formatSalaryRange } from "@/lib/staging/format-salary-range";

interface StagedVacancyDetailContentProps {
  vacancy: StagedVacancyWithAutomation;
}

/**
 * Pure presentational detail content for a staged vacancy.
 *
 * Renders the full field set (header, meta, description, company, classifications,
 * source metadata). Does NOT render a sheet/dialog wrapper or action buttons —
 * those are owned by `StagedVacancyDetailSheet`.
 */
export function StagedVacancyDetailContent({
  vacancy,
}: StagedVacancyDetailContentProps) {
  const { t, locale } = useTranslations();

  const hasSalary =
    vacancy.salaryMin != null || vacancy.salaryMax != null || Boolean(vacancy.salary);
  const hasExtendedMeta =
    Boolean(
      vacancy.employmentType ||
        (vacancy.positionOfferingCode && vacancy.positionOfferingCode !== "NS"),
    ) ||
    hasSalary ||
    (vacancy.requiredEducationLevel && vacancy.requiredEducationLevel !== "NS") ||
    vacancy.immediateStart === true ||
    (vacancy.numberOfPosts != null && vacancy.numberOfPosts > 1) ||
    vacancy.euresFlag === true ||
    Boolean(vacancy.contractStartDate || vacancy.contractEndDate) ||
    vacancy.requiredExperienceYears != null ||
    (vacancy.workingLanguages != null && vacancy.workingLanguages.length > 0) ||
    Boolean(vacancy.applicationDeadline);

  const hasCompanySection =
    Boolean(vacancy.companyUrl) ||
    Boolean(vacancy.companyDescription) ||
    Boolean(vacancy.companySize) ||
    (vacancy.industryCodes != null && vacancy.industryCodes.length > 0);

  const hasClassifications =
    vacancy.occupationUris != null && vacancy.occupationUris.length > 0;

  const postedAtFormatted = vacancy.postedAt
    ? formatDateShort(vacancy.postedAt, locale)
    : null;

  return (
    <div className="flex flex-col gap-6 text-sm">
      {/* Header */}
      <header className="flex items-start gap-3">
        {vacancy.employerName && (
          <CompanyLogo size="lg" companyName={vacancy.employerName} />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold leading-snug text-foreground break-words">
            {vacancy.title}
          </h2>
          {vacancy.employerName && (
            <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{vacancy.employerName}</span>
            </div>
          )}
        </div>
        {vacancy.matchScore != null && (
          <MatchScoreRing
            score={vacancy.matchScore}
            size={48}
            ariaLabel={t("staging.matchScoreAria").replace(
              "{score}",
              String(vacancy.matchScore),
            )}
          />
        )}
      </header>

      {/* Meta row */}
      <ul
        role="list"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground"
      >
        <li>
          <Badge variant="outline" className="text-xs">
            {vacancy.sourceBoard}
          </Badge>
        </li>
        {vacancy.location && (
          <li className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{vacancy.location}</span>
          </li>
        )}
        <li className="inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{formatDateShort(vacancy.discoveredAt, locale)}</span>
        </li>
        {postedAtFormatted && (
          <li className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{postedAtFormatted}</span>
          </li>
        )}
        {vacancy.applicationDeadline && (
          <li className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{vacancy.applicationDeadline}</span>
          </li>
        )}
        {vacancy.euresFlag && (
          <li>
            <Badge variant="secondary" className="text-xs inline-flex items-center gap-1">
              <Globe2 className="h-3 w-3" aria-hidden="true" />
              EURES
            </Badge>
          </li>
        )}
      </ul>

      {/* Key facts */}
      {hasExtendedMeta && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {vacancy.employmentType && (
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{vacancy.employmentType}</span>
            </div>
          )}
          {vacancy.positionOfferingCode && vacancy.positionOfferingCode !== "NS" && (
            <div>
              <Badge variant="outline" className="text-xs">
                {t(`staging.offering.${vacancy.positionOfferingCode}`)}
              </Badge>
            </div>
          )}
          {hasSalary && (
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <Banknote className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {formatSalaryRange(
                  vacancy.salaryMin,
                  vacancy.salaryMax,
                  vacancy.salaryCurrency,
                  vacancy.salaryPeriod,
                  locale,
                  t,
                ) || vacancy.salary}
              </span>
            </div>
          )}
          {vacancy.requiredEducationLevel && vacancy.requiredEducationLevel !== "NS" && (
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t(`staging.education.${vacancy.requiredEducationLevel}`)}</span>
            </div>
          )}
          {vacancy.requiredExperienceYears != null && (
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {vacancy.requiredExperienceYears} {t("staging.requiredExperience")}
              </span>
            </div>
          )}
          {vacancy.immediateStart && (
            <div>
              <Badge
                variant="default"
                className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              >
                {t("staging.immediateStart")}
              </Badge>
            </div>
          )}
          {vacancy.numberOfPosts != null && vacancy.numberOfPosts > 1 && (
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <Hash className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {t("staging.positions").replace("{count}", String(vacancy.numberOfPosts))}
              </span>
            </div>
          )}
          {vacancy.contractStartDate && (
            <div className="inline-flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {vacancy.contractStartDate}
                {vacancy.contractEndDate ? ` – ${vacancy.contractEndDate}` : ""}
              </span>
            </div>
          )}
          {vacancy.workingLanguages != null && vacancy.workingLanguages.length > 0 && (
            <div className="sm:col-span-2 inline-flex items-center gap-2 text-muted-foreground flex-wrap">
              <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <ul role="list" className="inline-flex flex-wrap gap-1.5">
                {vacancy.workingLanguages.map((lang) => (
                  <li key={lang}>
                    <Badge variant="outline" className="text-xs">
                      {lang}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Description */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("staging.detailsFullDescription")}
        </h3>
        {vacancy.description ? (
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {vacancy.description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {t("staging.detailsNoDescription")}
          </p>
        )}
      </section>

      {/* Application instructions */}
      {vacancy.applicationInstructions && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("staging.detailsApplicationInfo")}
          </h3>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {vacancy.applicationInstructions}
          </p>
        </section>
      )}

      {/* Company section */}
      {hasCompanySection && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("staging.detailsAboutCompany")}
          </h3>
          {vacancy.companyDescription && (
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {vacancy.companyDescription}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {vacancy.companyUrl && (
              <a
                href={vacancy.companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{vacancy.companyUrl}</span>
              </a>
            )}
            {vacancy.companySize && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                {vacancy.companySize}
              </span>
            )}
          </div>
          {vacancy.industryCodes != null && vacancy.industryCodes.length > 0 && (
            <ul role="list" className="flex flex-wrap gap-1.5">
              {vacancy.industryCodes.map((code) => (
                <li key={code}>
                  <Badge variant="outline" className="text-xs">
                    {code}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Classifications */}
      {hasClassifications && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("staging.detailsClassification")}
          </h3>
          <ul role="list" className="flex flex-wrap gap-1.5">
            {vacancy.occupationUris!.map((uri) => (
              <li key={uri}>
                <Badge variant="secondary" className="text-xs break-all">
                  {uri}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Source meta */}
      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("staging.detailsSource")}
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <dt className="font-medium">{t("staging.source")}</dt>
          <dd>{vacancy.sourceBoard}</dd>
          {vacancy.externalId && (
            <>
              <dt className="font-medium">ID</dt>
              <dd className="break-all font-mono">{vacancy.externalId}</dd>
            </>
          )}
          {vacancy.automation && (
            <>
              <dt className="font-medium">{t("staging.detailsAutomation")}</dt>
              <dd>{vacancy.automation.name}</dd>
            </>
          )}
        </dl>
        {vacancy.sourceUrl && (
          <a
            href={vacancy.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm self-start"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("staging.detailsOpenExternal")}
          </a>
        )}
      </section>
    </div>
  );
}
