"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import { isConsentBlocked } from "@/models/person.model";
import {
  type ReferralStatus,
  isValidReferralTransition,
} from "@/models/insideTrack.model";
import { resolveAppliedStatusId } from "@/lib/crm/resolve-applied-status";
import { emitEvent, createEvent, DomainEventTypes } from "@/lib/events";
import { writeDataAuditLog } from "@/lib/audit/data-audit";

// ---------------------------------------------------------------------------
// referral.actions.ts — Referral aggregate Repository (Welle 5, Inside Track).
// SoT: specs/inside-track.allium (RecordInsiderTip/RecordNetworkTip + the five
// status-gated stimulus rules + TipReifiesToJob). ADR-015: every query is
// userId-scoped; user_id comes from the session, never from client input.
// ---------------------------------------------------------------------------

interface RecordInsiderTipInput {
  tipsterId: string;
  targetCompanyId?: string | null;
  forwardedToId?: string | null;
}

interface RecordNetworkTipInput {
  tipsterId: string;
  insiderId?: string | null;
  viaId?: string | null;
  targetCompanyId?: string | null;
}

/** Verify the given Person belongs to the user and is not consent-blocked. */
async function assertUsablePerson(
  personId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const person = await prisma.person.findFirst({
    where: { id: personId, userId },
    select: { processingBasis: true, consentWithdrawnAt: true },
  });
  if (!person) return { ok: false, message: "crm.errors.personNotFound" };
  // GDPR Art. 7(3): no new processing tied to a consent-blocked contact.
  if (isConsentBlocked(person)) return { ok: false, message: "crm.errors.consentWithdrawn" };
  return { ok: true };
}

async function assertOwnedCompany(companyId: string, userId: string): Promise<boolean> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, createdBy: userId },
    select: { id: true },
  });
  return Boolean(company);
}

export async function recordInsiderTip(
  input: RecordInsiderTipInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const tipsterCheck = await assertUsablePerson(input.tipsterId, user.id);
    if (!tipsterCheck.ok) return { success: false, message: tipsterCheck.message };

    if (input.forwardedToId) {
      const fwd = await assertUsablePerson(input.forwardedToId, user.id);
      if (!fwd.ok) return { success: false, message: fwd.message };
    }
    if (input.targetCompanyId && !(await assertOwnedCompany(input.targetCompanyId, user.id))) {
      return { success: false, message: "crm.errors.companyNotFound" };
    }

    const referral = await prisma.referral.create({
      data: {
        userId: user.id,
        kind: "insider_relay",
        status: "open",
        tipsterId: input.tipsterId,
        forwardedToId: input.forwardedToId ?? null,
        targetCompanyId: input.targetCompanyId ?? null,
        updatedByType: "user",
        updatedById: user.id,
      },
      select: { id: true },
    });
    return { success: true, data: { id: referral.id } };
  } catch (error) {
    return handleError(error);
  }
}

export async function recordNetworkTip(
  input: RecordNetworkTipInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const tipsterCheck = await assertUsablePerson(input.tipsterId, user.id);
    if (!tipsterCheck.ok) return { success: false, message: tipsterCheck.message };

    if (input.insiderId) {
      const ins = await assertUsablePerson(input.insiderId, user.id);
      if (!ins.ok) return { success: false, message: ins.message };
    }
    if (input.targetCompanyId && !(await assertOwnedCompany(input.targetCompanyId, user.id))) {
      return { success: false, message: "crm.errors.companyNotFound" };
    }
    if (input.viaId) {
      const via = await prisma.personConnection.findFirst({
        where: { id: input.viaId, userId: user.id },
        select: { id: true },
      });
      if (!via) return { success: false, message: "crm.errors.connectionNotFound" };
    }

    const referral = await prisma.referral.create({
      data: {
        userId: user.id,
        kind: "network_path",
        status: "open",
        tipsterId: input.tipsterId,
        insiderId: input.insiderId ?? null,
        viaId: input.viaId ?? null,
        targetCompanyId: input.targetCompanyId ?? null,
        updatedByType: "user",
        updatedById: user.id,
      },
      select: { id: true },
    });
    return { success: true, data: { id: referral.id } };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Shared status-gated transition: fetch (userId-scoped), validate against the
 * inside-track lifecycle graph, then persist + refresh last_activity_at so
 * ReferralGoesStale re-arms.
 */
async function transitionReferral(
  referralId: string,
  to: ReferralStatus,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const referral = await prisma.referral.findFirst({
      where: { id: referralId, userId: user.id },
      select: { id: true, status: true },
    });
    if (!referral) return { success: false, message: "crm.errors.referralNotFound" };

    if (!isValidReferralTransition(referral.status, to)) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }

    await prisma.referral.update({
      where: { id: referralId },
      data: {
        status: to,
        lastActivityAt: new Date(),
        updatedByType: "user",
        updatedById: user.id,
      },
    });
    return { success: true, data: { id: referralId } };
  } catch (error) {
    return handleError(error);
  }
}

/** ApplicantEngagesTip: open -> engaged. */
export const engageReferral = (id: string) => transitionReferral(id, "engaged");
/** IntermediaryRelaysTip: engaged -> relayed. */
export const relayReferral = (id: string) => transitionReferral(id, "relayed");
/** TargetReviewsApplication: relayed -> in_review. */
export const reviewReferral = (id: string) => transitionReferral(id, "in_review");
/** DeclineReferral: {open,engaged,relayed,in_review,stale} -> declined. */
export const declineReferral = (id: string) => transitionReferral(id, "declined");
/** ReviveReferral: stale -> open. */
export const reviveReferral = (id: string) => transitionReferral(id, "open");

/**
 * TipReifiesToJob: the boundary between "a tip" and "a Job". A Job is created
 * only when the user commits to applying AND a target company is known; the
 * referral then transitions in_review -> converted (1:1 source_referral link).
 */
export async function commitReferralToApply(
  referralId: string,
): Promise<ActionResult<{ id: string; jobId: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const referral = await prisma.referral.findFirst({
      where: { id: referralId, userId: user.id },
      select: { id: true, status: true, targetCompanyId: true },
    });
    if (!referral) return { success: false, message: "crm.errors.referralNotFound" };

    // requires: status = in_review (validated against the lifecycle graph)
    if (!isValidReferralTransition(referral.status, "converted")) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }
    // requires: target_company != null
    if (!referral.targetCompanyId) {
      return { success: false, message: "crm.errors.referralRequiresTargetCompany" };
    }

    const company = await prisma.company.findFirst({
      where: { id: referral.targetCompanyId, createdBy: user.id },
      select: { id: true, label: true },
    });
    if (!company) return { success: false, message: "crm.errors.companyNotFound" };

    // Placeholder title (no posting exists for a speculative application); the
    // user renames it. Resolve the applied-kind status (never null).
    const statusId = await resolveAppliedStatusId(user.id);
    const jobTitle = await prisma.jobTitle.upsert({
      where: { value_createdBy: { value: company.label.trim().toLowerCase(), createdBy: user.id } },
      update: {},
      create: { label: company.label.trim(), value: company.label.trim().toLowerCase(), createdBy: user.id },
      select: { id: true },
    });

    // Atomic: create the Job (linked back via sourceReferralId) + its initial
    // JobStatusHistory + convert the referral, so a converted referral always
    // has its Job (ConvertedReferralHasJob) and the new Job is consistent with
    // every other Job (addJob also seeds history + emits JobStatusChanged).
    const result = await prisma.$transaction(async (tx) => {
      const newJob = await tx.job.create({
        data: {
          userId: user.id,
          companyId: company.id,
          jobTitleId: jobTitle.id,
          statusId,
          sourceReferralId: referral.id,
        },
        select: { id: true, Status: { select: { value: true } } },
      });
      const history = await tx.jobStatusHistory.create({
        data: {
          jobId: newJob.id,
          userId: user.id,
          previousStatusId: null,
          newStatusId: statusId,
          note: null,
          changedAt: new Date(),
        },
      });
      await tx.referral.update({
        where: { id: referralId },
        data: {
          status: "converted",
          lastActivityAt: new Date(),
          updatedByType: "user",
          updatedById: user.id,
        },
      });
      return { jobId: newJob.id, statusValue: newJob.Status.value, historyId: history.id };
    });

    // Post-commit side-effects (mirror addJob): timeline event + GDPR audit.
    emitEvent(
      createEvent(DomainEventTypes.JobStatusChanged, {
        jobId: result.jobId,
        userId: user.id,
        previousStatusValue: null,
        newStatusValue: result.statusValue,
        note: undefined,
        historyEntryId: result.historyId,
      }),
    );
    writeDataAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: "job.create",
      targetType: "job",
      targetId: result.jobId,
    });

    return { success: true, data: { id: referralId, jobId: result.jobId } };
  } catch (error) {
    return handleError(error);
  }
}
