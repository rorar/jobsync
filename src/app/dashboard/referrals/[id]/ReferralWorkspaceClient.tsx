"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, formatDateShort } from "@/i18n";
import { toast } from "@/components/ui/use-toast";
import {
  getReferral,
  engageReferral,
  relayReferral,
  reviewReferral,
  commitReferralToApply,
  reviveReferral,
  declineReferral,
  type ReferralDetail,
} from "@/actions/referral.actions";
import { ReferralLifecycleRail } from "@/components/inside-track/ReferralLifecycleRail";
import {
  ReferralActionBar,
  type ReferralActionKey,
} from "@/components/inside-track/ReferralActionBar";
import { WarmPathFinder } from "@/components/inside-track/WarmPathFinder";
import { ReferralStatusBadge } from "@/components/inside-track/ReferralStatusBadge";
import { ReferralKindBadge } from "@/components/inside-track/ReferralKindBadge";
import { tipsterDisplayName } from "@/components/inside-track/referralDisplay";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertTriangle, ExternalLink } from "lucide-react";

/** Replace {token} placeholders in a translated template. */
function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, v),
    template,
  );
}

/** Maps a status-gated action to its server action (the Repository). */
const ACTION_FNS: Record<
  ReferralActionKey,
  (id: string) => Promise<{ success: boolean; message?: string }>
> = {
  engage: engageReferral,
  relay: relayReferral,
  review: reviewReferral,
  commit: commitReferralToApply,
  revive: reviveReferral,
  decline: declineReferral,
};

export default function ReferralWorkspaceClient({ referralId }: { referralId: string }) {
  const { t, locale } = useTranslations();
  const router = useRouter();

  const [referral, setReferral] = useState<ReferralDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<ReferralActionKey | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Focus target after a transition: the action that triggered it may unmount,
  // so we programmatically move focus to the always-present status display
  // (a11y design §G item 2 — never let focus drop to <body>).
  const statusDisplayRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    const result = await getReferral(referralId);
    if (result.success && result.data) {
      setReferral(result.data);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  }, [referralId]);

  useEffect(() => {
    load();
  }, [load]);

  // Move focus to the status display once the post-transition re-render lands.
  useEffect(() => {
    if (pendingFocus.current && referral) {
      statusDisplayRef.current?.focus();
      pendingFocus.current = false;
    }
  }, [referral]);

  async function handleAction(action: ReferralActionKey) {
    if (!referral) return;
    setBusy(action);
    try {
      const res = await ACTION_FNS[action](referral.id);
      if (!res.success) {
        toast({ variant: "destructive", description: t(res.message ?? "errors.unknown") });
        return;
      }
      // Refetch so the new status + reified target_job are reflected live.
      const fresh = await getReferral(referral.id);
      if (fresh.success && fresh.data) {
        setReferral(fresh.data);
        const company = fresh.data.targetCompany?.label ?? "";
        const msg =
          fresh.data.status === "converted"
            ? interpolate(t("insideTrack.workspace.statusLiveConverted"), { company })
            : interpolate(t("insideTrack.workspace.statusLiveAnnouncement"), {
                company,
                status: t(`insideTrack.status.${fresh.data.status}`),
              });
        setAnnouncement(msg);
        pendingFocus.current = true;
      }
      toast({
        variant: "success",
        description:
          action === "commit"
            ? t("insideTrack.toast.jobCreated")
            : t("insideTrack.toast.statusUpdated"),
      });
    } catch {
      toast({ variant: "destructive", description: t("errors.unknown") });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="col-span-3 space-y-4 p-4 md:p-6">
        <Skeleton label={t("insideTrack.pageTitle")}>
          <div className="space-y-4">
            <div className="h-8 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-20 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-10 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        </Skeleton>
      </div>
    );
  }

  if (notFound || !referral) {
    return (
      <div className="col-span-3 flex flex-col items-center justify-center gap-4 p-4 py-20 md:p-6">
        <AlertTriangle className="h-12 w-12 text-destructive" aria-hidden="true" />
        <p className="text-lg font-medium">{t("insideTrack.workspace.notFound")}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/referrals")}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("insideTrack.workspace.backToList")}
        </Button>
      </div>
    );
  }

  const company = referral.targetCompany;

  return (
    <div className="col-span-3 space-y-6 p-4 md:p-6">
      {/* Polite live region for status transitions (a11y §G item 2). */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="referral-status-live"
      >
        {announcement}
      </span>

      {/* Header */}
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-2"
          onClick={() => router.push("/dashboard/referrals")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("insideTrack.workspace.backToList")}
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <ReferralKindBadge kind={referral.kind} />
          <div
            ref={statusDisplayRef}
            tabIndex={-1}
            aria-label={interpolate(t("insideTrack.lifecycle.currentStatus"), {
              status: t(`insideTrack.status.${referral.status}`),
            })}
            data-testid="referral-status-display"
            className="inline-flex rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ReferralStatusBadge status={referral.status} />
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">
          {company?.label ?? t("insideTrack.list.noCompany")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("insideTrack.workspace.tipsterLabel")}: {tipsterDisplayName(referral.tipster, t)}
          {" · "}
          {t("insideTrack.workspace.receivedLabel")}:{" "}
          {formatDateShort(new Date(referral.receivedAt), locale)}
        </p>
      </div>

      {/* Two-column: lifecycle + actions | warm paths */}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <ReferralLifecycleRail status={referral.status} />

          {referral.status === "converted" ? (
            <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950">
              <p className="font-medium">{t("insideTrack.workspace.convertedBanner")}</p>
              {referral.targetJobId && (
                <Link
                  href={`/dashboard/myjobs/${referral.targetJobId}`}
                  className="mt-2 inline-flex items-center gap-1 text-primary underline"
                >
                  {t("insideTrack.workspace.viewJob")}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          ) : referral.status === "declined" ? (
            <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
              {t("insideTrack.workspace.declinedBanner")}
            </div>
          ) : (
            <ReferralActionBar
              status={referral.status}
              kind={referral.kind}
              hasTargetCompany={Boolean(company)}
              companyName={company?.label}
              onAction={handleAction}
              busy={busy !== null}
            />
          )}
        </div>

        {company && (
          <div>
            <WarmPathFinder companyId={company.id} companyName={company.label} />
          </div>
        )}
      </div>
    </div>
  );
}
