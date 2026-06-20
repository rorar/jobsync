"use client";

/**
 * ReferralActionBar — Welle 5 (Inside Track) Phase 5, Task 5.5
 *
 * Status-gated action affordance. Renders ONLY the legal forward action for
 * the current status (illegal transitions are unmounted, absent from a11y tree).
 *
 * DESIGN CONTRACT (docs/design/inside-track-ui.md §E + §G items 2+3 + §H):
 *  - group role with translated label
 *  - engage/relay labels are kind-variant-aware
 *  - in_review + !hasTargetCompany → aria-disabled (NOT disabled), aria-describedby
 *  - in_review + hasTargetCompany → AlertDialog with {company} interpolation
 *  - decline (AlertDialog) present for all non-terminal working states
 *  - busy → aria-busy="true" on group, Loader2 spinner in active button, button disabled
 *  - NO server calls, NO focus management, NO aria-live — parent does those
 *
 * SoT: specs/inside-track.allium (lifecycle graph)
 */

import { useId } from "react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { cn, interpolate } from "@/lib/utils";
import type { ReferralStatus, ReferralKind } from "@/models/insideTrack.model";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReferralActionKey =
  | "engage"
  | "relay"
  | "review"
  | "commit"
  | "revive"
  | "decline";

export interface ReferralActionBarProps {
  status: ReferralStatus;
  kind: ReferralKind;
  hasTargetCompany: boolean;
  companyName?: string;
  onAction: (action: ReferralActionKey) => void | Promise<void>;
  busy?: boolean;
}

// ---------------------------------------------------------------------------
// Statuses where decline is available (non-terminal, working + stale)
// ---------------------------------------------------------------------------

const DECLINE_AVAILABLE: ReadonlySet<ReferralStatus> = new Set([
  "open",
  "engaged",
  "relayed",
  "in_review",
  "stale",
]);

// ---------------------------------------------------------------------------
// Sub-component: Decline AlertDialog
// ---------------------------------------------------------------------------

function DeclineDialog({
  t,
  onAction,
}: {
  t: (key: string) => string;
  onAction: (action: ReferralActionKey) => void | Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="lg"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {t("insideTrack.action.decline")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("insideTrack.action.declineConfirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("insideTrack.action.declineConfirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("insideTrack.action.confirmCancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onAction("decline")}
          >
            {t("insideTrack.action.confirmContinue")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReferralActionBar({
  status,
  kind,
  hasTargetCompany,
  companyName,
  onAction,
  busy = false,
}: ReferralActionBarProps) {
  const { t } = useTranslations();

  // Stable id for aria-describedby on the blocked commit button
  const commitDescId = useId();
  // Stable id for the action-group context description (review §E: aria-describedby)
  const ctxDescId = useId();

  // ---------------------------------------------------------------------------
  // Derive the forward action button (if any)
  // ---------------------------------------------------------------------------

  let forwardAction: React.ReactNode = null;

  if (status === "open") {
    const label = t(`insideTrack.action.engage.${kind}`);
    forwardAction = (
      <Button
        size="lg"
        disabled={busy}
        onClick={() => onAction("engage")}
      >
        {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {label}
      </Button>
    );
  } else if (status === "engaged") {
    const label = t(`insideTrack.action.relay.${kind}`);
    forwardAction = (
      <Button
        size="lg"
        disabled={busy}
        onClick={() => onAction("relay")}
      >
        {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {label}
      </Button>
    );
  } else if (status === "relayed") {
    forwardAction = (
      <Button
        size="lg"
        disabled={busy}
        onClick={() => onAction("review")}
      >
        {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {t("insideTrack.action.review")}
      </Button>
    );
  } else if (status === "in_review") {
    if (!hasTargetCompany) {
      // Blocked: aria-disabled, NOT html disabled, aria-describedby explanation
      forwardAction = (
        <>
          <button
            type="button"
            aria-disabled="true"
            aria-describedby={commitDescId}
            className={cn(
              // Match Button size="lg" + variant="default" visually
              "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
              "h-11 px-8",
              "bg-primary text-primary-foreground opacity-50 cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            onClick={(e) => e.preventDefault()}
          >
            {t("insideTrack.action.commitToApply")}
          </button>
          <span id={commitDescId} className="sr-only">
            {t("insideTrack.action.commitToApplyRequiresCompany")}
          </span>
        </>
      );
    } else {
      // Enabled: wrap in AlertDialog
      const descriptionTemplate = t(
        "insideTrack.action.commitToApplyConfirmDescription",
      );
      const description = interpolate(descriptionTemplate, {
        company: companyName ?? "",
      });
      forwardAction = (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg" disabled={busy}>
              {busy && (
                <Loader2
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {t("insideTrack.action.commitToApply")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("insideTrack.action.commitToApplyConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("insideTrack.action.confirmCancel")}
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => onAction("commit")}>
                {t("insideTrack.action.confirmContinue")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    }
  } else if (status === "stale") {
    forwardAction = (
      <Button
        size="lg"
        disabled={busy}
        onClick={() => onAction("revive")}
      >
        {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {t("insideTrack.action.revive")}
      </Button>
    );
  }
  // converted / declined → forwardAction stays null (unmounted)

  const showDecline = DECLINE_AVAILABLE.has(status);

  return (
    <div
      role="group"
      aria-label={t("insideTrack.workspace.availableActions")}
      aria-describedby={ctxDescId}
      aria-busy={busy ? "true" : undefined}
      className="flex flex-wrap items-center gap-3"
    >
      <span id={ctxDescId} className="sr-only">
        {interpolate(t("insideTrack.workspace.actionsContextDescription"), {
          status: t(`insideTrack.status.${status}`),
        })}
      </span>
      {forwardAction}
      {showDecline && <DeclineDialog t={t} onAction={onAction} />}
    </div>
  );
}
