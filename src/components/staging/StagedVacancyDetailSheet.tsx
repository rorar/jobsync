"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  ArrowUpCircle,
  XCircle,
  Archive,
  Ban,
  Star,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { StagedVacancyDetailContent } from "./StagedVacancyDetailContent";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

export type StagedVacancyDetailMode = "list" | "deck";

type ActionKey =
  | "promote"
  | "dismiss"
  | "archive"
  | "block"
  | "superlike"
  | "skip";

export interface StagedVacancyDetailSheetProps {
  vacancy: StagedVacancyWithAutomation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: StagedVacancyDetailMode;
  onDismiss?: (vacancy: StagedVacancyWithAutomation) => void | Promise<void>;
  onPromote?: (vacancy: StagedVacancyWithAutomation) => void | Promise<void>;
  onSuperLike?: (vacancy: StagedVacancyWithAutomation) => void | Promise<void>;
  onBlock?: (vacancy: StagedVacancyWithAutomation) => void | Promise<void>;
  onArchive?: (vacancy: StagedVacancyWithAutomation) => void | Promise<void>;
  onSkip?: (vacancy: StagedVacancyWithAutomation) => void | Promise<void>;
}

/**
 * Responsive Sheet container that displays the full details of a staged vacancy.
 *
 * Uses a right-side sheet on desktop (`sm+`) and a bottom sheet on mobile
 * (`<sm`). Preserves focus trap, ESC-to-close, and focus restoration via the
 * underlying Radix `Sheet` primitive.
 *
 * The sheet never mutates deck/list state on its own — actions trigger the
 * callbacks supplied by the parent. After any action resolves, the sheet
 * closes via `onOpenChange(false)`.
 */
export function StagedVacancyDetailSheet({
  vacancy,
  open,
  onOpenChange,
  mode,
  onDismiss,
  onPromote,
  onSuperLike,
  onBlock,
  onArchive,
  onSkip,
}: StagedVacancyDetailSheetProps) {
  const { t } = useTranslations();
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [loadingAction, setLoadingAction] = useState<ActionKey | null>(null);

  const side = isDesktop ? "right" : "bottom";

  const runAction = async (
    key: ActionKey,
    handler?: (v: StagedVacancyWithAutomation) => void | Promise<void>,
  ) => {
    if (!vacancy || !handler || loadingAction !== null) return;
    setLoadingAction(key);
    try {
      await handler(vacancy);
      onOpenChange(false);
    } catch (error) {
      console.error(`[StagedVacancyDetailSheet] Action "${key}" failed:`, error);
    } finally {
      setLoadingAction(null);
    }
  };

  const subtitle =
    vacancy &&
    [vacancy.employerName, vacancy.location].filter(Boolean).join(" · ");

  const anyLoading = loadingAction !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        aria-describedby={vacancy ? "staged-vacancy-detail-description" : undefined}
        className={cn(
          "flex flex-col gap-0 p-0 motion-reduce:!animate-none motion-reduce:!transition-none",
          side === "right"
            ? "w-full sm:max-w-xl lg:max-w-[640px] lg:!w-[640px] h-full"
            : "inset-x-0 bottom-0 h-[92vh] rounded-t-xl",
        )}
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="sr-only">
            {vacancy ? vacancy.title : t("staging.detailsTitle")}
          </SheetTitle>
          <SheetDescription
            id="staged-vacancy-detail-description"
            className="sr-only"
          >
            {subtitle || t("staging.detailsTitle")}
          </SheetDescription>
          {/* Visual heading (the SheetTitle is sr-only so the big typography */}
          {/* in StagedVacancyDetailContent acts as the visible title). */}
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("staging.detailsTitle")}
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5">
            {vacancy ? (
              <StagedVacancyDetailContent vacancy={vacancy} />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {t("staging.detailsNoDescription")}
              </p>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t border-border bg-background px-5 py-3 sm:flex-row sm:justify-end sm:space-x-0 gap-2 flex-wrap">
          {mode === "list" && (
            <>
              {onPromote && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("promote", onPromote)}
                  aria-label={t("staging.promote")}
                >
                  {loadingAction === "promote" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("staging.promote")}
                </Button>
              )}
              {onDismiss && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("dismiss", onDismiss)}
                  aria-label={t("staging.dismiss")}
                >
                  {loadingAction === "dismiss" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("staging.dismiss")}
                </Button>
              )}
              {onArchive && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("archive", onArchive)}
                  aria-label={t("staging.archive")}
                >
                  {loadingAction === "archive" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("staging.archive")}
                </Button>
              )}
              {onSuperLike && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("superlike", onSuperLike)}
                  aria-label={t("deck.superLike")}
                >
                  {loadingAction === "superlike" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("deck.superLike")}
                </Button>
              )}
              {onBlock && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("block", onBlock)}
                  aria-label={t("deck.block")}
                >
                  {loadingAction === "block" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("deck.block")}
                </Button>
              )}
            </>
          )}

          {mode === "deck" && (
            <>
              {onPromote && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("promote", onPromote)}
                  aria-label={t("deck.promote")}
                >
                  {loadingAction === "promote" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("deck.promote")}
                </Button>
              )}
              {onSuperLike && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("superlike", onSuperLike)}
                  aria-label={t("deck.superLike")}
                >
                  {loadingAction === "superlike" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("deck.superLike")}
                </Button>
              )}
              {onDismiss && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("dismiss", onDismiss)}
                  aria-label={t("deck.dismiss")}
                >
                  {loadingAction === "dismiss" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("deck.dismiss")}
                </Button>
              )}
              {onBlock && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("block", onBlock)}
                  aria-label={t("deck.block")}
                >
                  {loadingAction === "block" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("deck.block")}
                </Button>
              )}
              {onSkip && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  disabled={anyLoading || !vacancy}
                  onClick={() => runAction("skip", onSkip)}
                  aria-label={t("deck.skip")}
                >
                  {loadingAction === "skip" ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t("deck.skip")}
                </Button>
              )}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
