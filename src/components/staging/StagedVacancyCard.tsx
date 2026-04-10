"use client";

import React from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

/**
 * FooterActionButton — M-Y-01 (Sprint 3 Stream F) hit-area wrapper
 *
 * The footer buttons (Promote, Dismiss, Archive, Trash, Block, Restore,
 * Details) were rendered with `h-7` (28px) — below the WCAG 2.5.5 AAA
 * minimum of 44x44. The visible pill is preserved at 28 tall to keep
 * the compact card density, but the focusable pointer target is now
 * 44 tall via an outer wrapper button.
 *
 * Pattern mirrors Sprint 1 CRIT-Y1 DeckCard.Info (`DeckCard.tsx:89-115`):
 *   - The outer native `<button>` owns the real keyboard/pointer target
 *     and carries `min-h-[44px]`. Negative vertical margin (`-my-2`)
 *     collapses the extra height into the card footer's padding so
 *     the visual row height is unchanged.
 *   - The inner `<span>` is aria-hidden and replicates the Shadcn
 *     button variant styling at 28 tall (`h-7 gap-1 text-xs`). It
 *     forwards hover/active feedback via Tailwind's `group` utility,
 *     so the full 44x44 click area lights up the visible pill on
 *     interaction.
 *   - `aria-label` is forwarded to the outer button — the single
 *     accessible-name source per WCAG 4.1.2.
 *
 * Nested interactive elements are avoided: the outer is the ONLY
 * interactive element; the inner pill is a visual span.
 */
type FooterVariant = "default" | "outline" | "ghost";

interface FooterActionButtonProps {
  variant: FooterVariant;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  /** Adds `text-destructive` to the visible pill (for Trash action). */
  destructive?: boolean;
  testId?: string;
}

function FooterActionButton({
  variant,
  onClick,
  ariaLabel,
  children,
  destructive = false,
  testId,
}: FooterActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      // Outer: 44 tall hit area, collapsed visually via negative margin.
      // No visible style — all visual weight is on the inner pill span.
      className="group inline-flex min-h-[44px] -my-2 items-center justify-center rounded-md
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        // Inner: 28 tall visible pill — reuses Shadcn button variant colors
        // via `buttonVariants`. We override sizing manually since Shadcn's
        // built-in sm size would clobber our h-7. Hover feedback is forwarded
        // from the outer wrapper via `group-hover` modifiers.
        className={cn(
          // Base: reproduces Shadcn Button's inline-flex/gap/text/ring layer
          // minus focus-ring (owned by the outer button) and minus transition
          // delay (hover feedback is instant on the outer hover group).
          "inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors",
          // Variant colors via group-hover so the whole 44x44 area reacts.
          variant === "default" &&
            "bg-primary text-primary-foreground group-hover:bg-primary/90",
          variant === "outline" &&
            "border border-input bg-background group-hover:bg-accent group-hover:text-accent-foreground",
          variant === "ghost" &&
            "group-hover:bg-accent group-hover:text-accent-foreground",
          destructive && "text-destructive",
        )}
      >
        {children}
      </span>
    </button>
  );
}


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

/**
 * StagedVacancyCard — memoized via React.memo (M-P-03, Sprint 3 Stream F).
 *
 * Without memoization, every StagingContainer re-render forced all
 * staged-vacancy cards to re-render even when no individual vacancy
 * prop had changed identity. List pages render up to 50 cards at a
 * time, so the dashboard re-render cost scaled linearly with list
 * size on every server-action roundtrip.
 *
 * The memo is paired with the M-P-03 `useStagingActions.createHandler`
 * stability fix (see `src/hooks/useStagingActions.ts`) — without stable
 * handler identity the memo would be a no-op because handler props
 * (onDismiss, onArchive, onTrash, onRestore, onRestoreFromTrash) would
 * still change on every parent render. Both fixes MUST land together;
 * either alone is invisible.
 *
 * `onPromote`, `onOpenDetails`, and `onBlockCompany` come from
 * StagingContainer already wrapped in `useCallback` — the remaining
 * callback props receive stable references via the `createHandler`
 * identity fix. Default comparison via `Object.is` is sufficient; we
 * don't need a custom areEqual because:
 *   - `vacancy` is a new object on each reload but identity-equal
 *     between renders that do not reload;
 *   - `activeTab`, `selected` are primitives;
 *   - handler props are now all stable.
 */
function StagedVacancyCardImpl({
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
                <FooterActionButton
                  variant="ghost"
                  onClick={() => onOpenDetails(vacancy)}
                  ariaLabel={`${t("staging.details")}: ${vacancyContext}`}
                  testId="staged-vacancy-details-button"
                >
                  <Info className="h-3.5 w-3.5" />
                  {t("staging.details")}
                </FooterActionButton>
              )}
              {activeTab === "new" && (
                <>
                  <FooterActionButton
                    variant="default"
                    onClick={() => onPromote(vacancy)}
                    ariaLabel={`${t("staging.promote")}: ${vacancyContext}`}
                    testId="staged-vacancy-promote-button"
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                    {t("staging.promote")}
                  </FooterActionButton>
                  <FooterActionButton
                    variant="outline"
                    onClick={() => onDismiss(vacancy.id)}
                    ariaLabel={`${t("staging.dismiss")}: ${vacancyContext}`}
                    testId="staged-vacancy-dismiss-button"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {t("staging.dismiss")}
                  </FooterActionButton>
                  <FooterActionButton
                    variant="ghost"
                    onClick={() => onArchive(vacancy.id)}
                    ariaLabel={`${t("staging.archive")}: ${vacancyContext}`}
                    testId="staged-vacancy-archive-button"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {t("staging.archive")}
                  </FooterActionButton>
                  <FooterActionButton
                    variant="ghost"
                    destructive
                    onClick={() => onTrash(vacancy.id)}
                    ariaLabel={`${t("staging.trash")}: ${vacancyContext}`}
                    testId="staged-vacancy-trash-button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("staging.trash")}
                  </FooterActionButton>
                  {onBlockCompany && vacancy.employerName && (
                    <FooterActionButton
                      variant="ghost"
                      onClick={() => onBlockCompany(vacancy.employerName!)}
                      ariaLabel={`${t("blacklist.blockCompany")}: ${vacancy.employerName}`}
                      testId="staged-vacancy-block-button"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      {t("blacklist.blockCompany")}
                    </FooterActionButton>
                  )}
                </>
              )}
              {activeTab === "dismissed" && (
                <>
                  <FooterActionButton
                    variant="outline"
                    onClick={() => onRestore(vacancy.id)}
                    ariaLabel={`${t("staging.restore")}: ${vacancyContext}`}
                    testId="staged-vacancy-restore-button"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("staging.restore")}
                  </FooterActionButton>
                  <FooterActionButton
                    variant="ghost"
                    destructive
                    onClick={() => onTrash(vacancy.id)}
                    ariaLabel={`${t("staging.trash")}: ${vacancyContext}`}
                    testId="staged-vacancy-trash-button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("staging.trash")}
                  </FooterActionButton>
                </>
              )}
              {activeTab === "archive" && (
                <FooterActionButton
                  variant="outline"
                  onClick={() => onRestore(vacancy.id)}
                  ariaLabel={`${t("staging.restore")}: ${vacancyContext}`}
                  testId="staged-vacancy-restore-button"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("staging.restore")}
                </FooterActionButton>
              )}
              {activeTab === "trash" && (
                <FooterActionButton
                  variant="outline"
                  onClick={() => onRestoreFromTrash(vacancy.id)}
                  ariaLabel={`${t("staging.restore")}: ${vacancyContext}`}
                  testId="staged-vacancy-restore-button"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("staging.restore")}
                </FooterActionButton>
              )}
            </>
          );
        })()}
      </CardFooter>
    </Card>
  );
}

// M-P-03 (Sprint 3 Stream F): wrap in React.memo so list-mode pages with
// 20-50 cards don't re-render every card on every parent state change.
// Paired with the `useStagingActions.createHandler` identity-stability
// fix in the same sprint — without that, handler props would change on
// every parent render and the memo would be a no-op.
export const StagedVacancyCard = React.memo(StagedVacancyCardImpl);
StagedVacancyCard.displayName = "StagedVacancyCard";
