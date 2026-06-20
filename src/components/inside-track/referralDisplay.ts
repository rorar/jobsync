import type { ReferralPersonRef } from "@/actions/referral.actions";

type Translate = (key: string) => string;

/**
 * Live tipster display name (@guarantee TipsterShownLive / TipsterReferenceResolvesLive,
 * specs/inside-track.allium). Resolved from the live Person — an anonymized
 * contact renders de-identified rather than leaking a stale name. Used by both
 * the referral list and the ReferralWorkspace so the rule is enforced once.
 */
export function tipsterDisplayName(
  tipster: ReferralPersonRef | null | undefined,
  t: Translate,
): string {
  if (!tipster) return t("insideTrack.workspace.noTipster");
  if (tipster.status === "anonymized") return t("insideTrack.workspace.deidentified");
  const name = [tipster.firstName, tipster.lastName].filter(Boolean).join(" ").trim();
  return name || t("insideTrack.workspace.deidentified");
}
