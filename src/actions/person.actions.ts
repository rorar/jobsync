"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
import {
  type TypedEmail,
  type TypedPhone,
  type CompanyAssociation,
  type SocialProfile,
  type PersonStatus,
  type DataSource,
  type ProcessingBasis,
  isValidPersonTransition,
  isConsentBlocked,
  validateAtMostOnePrimaryCompany,
  parseEmails,
  parsePhones,
  parseCompanies,
  parseSocialProfiles,
  CRM_CONFIG,
} from "@/models/person.model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonInput {
  firstName?: string | null;
  lastName?: string | null;
  emails: TypedEmail[];
  phones?: TypedPhone[];
  companies?: CompanyAssociation[];
  headline?: string | null;
  socialProfiles?: SocialProfile[];
  addressStreet?: string | null;
  addressCity?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;
  addressCountryCode?: string | null;
  addressSubdivisionCode?: string | null;
}

interface PersonUpdateInput {
  firstName?: string | null;
  lastName?: string | null;
  emails?: TypedEmail[];
  phones?: TypedPhone[];
  companies?: CompanyAssociation[];
  headline?: string | null;
  socialProfiles?: SocialProfile[];
  avatarUrl?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;
  addressCountryCode?: string | null;
  addressSubdivisionCode?: string | null;
  processingBasis?: ProcessingBasis;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createPerson(input: PersonInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    if (!input.emails || input.emails.length === 0) {
      return { success: false, message: "crm.errors.emailRequired" };
    }

    // Check person limit
    const count = await prisma.person.count({ where: { userId: user.id } });
    if (count >= CRM_CONFIG.maxPersonsPerUser) {
      return { success: false, message: "crm.errors.personLimitReached" };
    }

    const companies = input.companies ?? [];
    if (!validateAtMostOnePrimaryCompany(companies)) {
      return { success: false, message: "crm.errors.multiplePrimaryCompanies" };
    }

    const ALLOWED_URL_SCHEMES = /^https?:\/\//i;
    if (input.socialProfiles?.some(sp => sp.url && !ALLOWED_URL_SCHEMES.test(sp.url))) {
      return { success: false, message: "crm.errors.invalidSocialProfileUrl" };
    }

    const VALID_PLATFORMS = ["linkedin", "xing", "github", "twitter", "other"];
    if (input.socialProfiles?.some(sp => !VALID_PLATFORMS.includes(sp.platform))) {
      return { success: false, message: "crm.errors.invalidPlatform" };
    }

    // Validate ISO 3166 codes at boundary (only if provided, null is valid)
    if (input.addressCountryCode) {
      if (!/^[A-Z]{2}$/i.test(input.addressCountryCode)) {
        return { success: false, message: "crm.errors.invalidCountryCode" };
      }
    }
    if (input.addressSubdivisionCode && !input.addressCountryCode) {
      return { success: false, message: "crm.errors.subdivisionWithoutCountry" };
    }

    const person = await prisma.person.create({
      data: {
        userId: user.id,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        emails: JSON.stringify(input.emails),
        phones: JSON.stringify(input.phones ?? []),
        companies: JSON.stringify(companies),
        headline: input.headline ?? null,
        socialProfiles: JSON.stringify(input.socialProfiles ?? []),
        updatedBySource: "manual",
        updatedByName: user.name,
        addressStreet: input.addressStreet ?? null,
        addressCity: input.addressCity ?? null,
        addressPostalCode: input.addressPostalCode ?? null,
        addressCountry: input.addressCountry ?? null,
        addressCountryCode: input.addressCountryCode ?? null,
        addressSubdivisionCode: input.addressSubdivisionCode ?? null,
        status: "active",
        dataSource: "manual",
        processingBasis: "legitimate_interest",
        createdBySource: "manual",
        createdByName: user.name,
      },
    });

    eventBus.publish(
      createEvent(DomainEventType.ContactCreated, {
        personId: person.id,
        userId: user.id,
        source: "manual",
      }),
    );

    return { success: true, data: { id: person.id } };
  } catch (error) {
    return handleError(error);
  }
}

export async function getPerson(personId: string): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const person = await prisma.person.findFirst({
      where: { id: personId, userId: user.id },
    });

    if (!person) return { success: false, message: "crm.errors.personNotFound" };

    // GDPR audit (S6b): record PII read-access. Fire-and-forget, server-only.
    // Minimisation (Art. 5(1)(c)): target id + actor only — never PII content.
    writeDataAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: "person.pii_read",
      targetType: "person",
      targetId: person.id,
    });

    return {
      success: true,
      data: {
        ...person,
        emails: parseEmails(person.emails),
        phones: parsePhones(person.phones),
        companies: parseCompanies(person.companies),
        socialProfiles: parseSocialProfiles(person.socialProfiles),
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function getPersons(filters?: {
  status?: PersonStatus;
  dataSource?: DataSource;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<ActionResult<{ persons: Record<string, unknown>[]; total: number }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const page = Math.max(1, filters?.page ?? 1);
    const pageSize = Math.min(Math.max(1, filters?.pageSize ?? 25), 100);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { userId: user.id };
    if (filters?.status) where.status = filters.status;
    if (filters?.dataSource) where.dataSource = filters.dataSource;
    if (filters?.search) {
      // Escape LIKE metacharacters for SQLite (Finding 6 fix)
      const s = filters.search
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      where.OR = [
        { firstName: { contains: s } },
        { lastName: { contains: s } },
        { emails: { contains: s } },
        { headline: { contains: s } },
        { companies: { contains: s } },
        { addressCountryCode: { contains: s } },
        { addressSubdivisionCode: { contains: s } },
      ];
    }

    const [persons, total] = await Promise.all([
      prisma.person.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.person.count({ where }),
    ]);

    // GDPR audit (S6b): the list view exposes each returned person's PII
    // (emails/phones/...), so record ONE read-access entry per person shown —
    // precise DSAR granularity. The page is bounded (pageSize <= 100), so
    // volume is acceptable. Fire-and-forget, server-only. Minimisation
    // (Art. 5(1)(c)): target id + actor only — never PII content.
    for (const p of persons) {
      writeDataAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        action: "person.pii_read",
        targetType: "person",
        targetId: p.id,
      });
    }

    return {
      success: true,
      data: {
        persons: persons.map((p) => ({
          ...p,
          emails: parseEmails(p.emails),
          phones: parsePhones(p.phones),
          companies: parseCompanies(p.companies),
          socialProfiles: parseSocialProfiles(p.socialProfiles),
        })),
        total,
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function updatePerson(
  personId: string,
  input: PersonUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const existing = await prisma.person.findFirst({
      where: { id: personId, userId: user.id },
    });
    if (!existing) return { success: false, message: "crm.errors.personNotFound" };
    if (existing.status !== "active") {
      return { success: false, message: "crm.errors.personNotActive" };
    }
    // GDPR Art. 7(3): consent withdrawn → processing restricted. No further
    // edits are permitted; only export / anonymize / delete / reinstate-consent.
    if (isConsentBlocked(existing)) {
      return { success: false, message: "crm.errors.consentWithdrawn" };
    }

    const data: Record<string, unknown> = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.emails !== undefined) data.emails = JSON.stringify(input.emails);
    if (input.phones !== undefined) data.phones = JSON.stringify(input.phones);
    if (input.companies !== undefined) {
      if (!validateAtMostOnePrimaryCompany(input.companies)) {
        return { success: false, message: "crm.errors.multiplePrimaryCompanies" };
      }
      data.companies = JSON.stringify(input.companies);
    }
    if (input.headline !== undefined) data.headline = input.headline;
    if (input.socialProfiles !== undefined) {
      const ALLOWED_URL_SCHEMES = /^https?:\/\//i;
      if (input.socialProfiles.some(sp => sp.url && !ALLOWED_URL_SCHEMES.test(sp.url))) {
        return { success: false, message: "crm.errors.invalidSocialProfileUrl" };
      }

      const VALID_PLATFORMS = ["linkedin", "xing", "github", "twitter", "other"];
      if (input.socialProfiles.some(sp => !VALID_PLATFORMS.includes(sp.platform))) {
        return { success: false, message: "crm.errors.invalidPlatform" };
      }

      data.socialProfiles = JSON.stringify(input.socialProfiles);
    }
    // Kette A: updated_by tracking
    data.updatedBySource = "manual";
    data.updatedByName = user.name;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
    if (input.addressStreet !== undefined) data.addressStreet = input.addressStreet;
    if (input.addressCity !== undefined) data.addressCity = input.addressCity;
    if (input.addressPostalCode !== undefined) data.addressPostalCode = input.addressPostalCode;
    if (input.addressCountry !== undefined) data.addressCountry = input.addressCountry;
    if (input.addressCountryCode !== undefined) {
      if (input.addressCountryCode && !/^[A-Z]{2}$/i.test(input.addressCountryCode)) {
        return { success: false, message: "crm.errors.invalidCountryCode" };
      }
      data.addressCountryCode = input.addressCountryCode;
    }
    if (input.addressSubdivisionCode !== undefined) {
      data.addressSubdivisionCode = input.addressSubdivisionCode;
    }
    if (input.processingBasis !== undefined) data.processingBasis = input.processingBasis;

    await prisma.person.update({
      where: { id: personId, userId: user.id },
      data,
    });

    eventBus.publish(
      createEvent(DomainEventType.ContactUpdated, {
        personId,
        userId: user.id,
      }),
    );

    return { success: true, data: { id: personId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function archivePerson(personId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const person = await prisma.person.findFirst({
      where: { id: personId, userId: user.id },
    });
    if (!person) return { success: false, message: "crm.errors.personNotFound" };
    if (!isValidPersonTransition(person.status as PersonStatus, "archived")) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }

    await prisma.person.update({
      where: { id: personId, userId: user.id },
      data: { status: "archived" },
    });

    return { success: true, data: { id: personId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function reactivatePerson(personId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const person = await prisma.person.findFirst({
      where: { id: personId, userId: user.id },
    });
    if (!person) return { success: false, message: "crm.errors.personNotFound" };
    if (!isValidPersonTransition(person.status as PersonStatus, "active")) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }

    await prisma.person.update({
      where: { id: personId, userId: user.id },
      data: { status: "active" },
    });

    return { success: true, data: { id: personId } };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * GDPR Art. 7(3): withdraw a Person's consent. Only valid when the lawful basis
 * is `consent` and consent has not already been withdrawn. Records the withdrawal
 * timestamp, after which the Person is processing-restricted (see isConsentBlocked):
 * edits are blocked and automated CRM reminders skip the record. Auth-gated by
 * owner (ADR-015). Reversible via reinstateConsent.
 */
export async function withdrawConsent(
  personId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const person = await prisma.person.findFirst({
      where: { id: personId, userId: user.id },
      select: { processingBasis: true, consentWithdrawnAt: true },
    });
    if (!person) return { success: false, message: "crm.errors.personNotFound" };
    if (person.processingBasis !== "consent") {
      return { success: false, message: "crm.errors.consentNotApplicable" };
    }
    if (person.consentWithdrawnAt != null) {
      return { success: false, message: "crm.errors.consentAlreadyWithdrawn" };
    }

    await prisma.person.update({
      where: { id: personId, userId: user.id },
      data: {
        consentWithdrawnAt: new Date(),
        updatedBySource: "manual",
        updatedByName: user.name,
      },
    });

    eventBus.publish(
      createEvent(DomainEventType.ContactUpdated, { personId, userId: user.id }),
    );

    return { success: true, data: { id: personId }, message: "crm.consentWithdrawnSuccess" };
  } catch (error) {
    return handleError(error, "crm.errors.withdrawConsent");
  }
}

/**
 * Reinstate (re-grant) a Person's consent that was previously withdrawn. Clears
 * the withdrawal timestamp, lifting the processing restriction. Only valid when
 * basis is `consent` and consent is currently withdrawn. Auth-gated (ADR-015).
 */
export async function reinstateConsent(
  personId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const person = await prisma.person.findFirst({
      where: { id: personId, userId: user.id },
      select: { processingBasis: true, consentWithdrawnAt: true },
    });
    if (!person) return { success: false, message: "crm.errors.personNotFound" };
    if (person.processingBasis !== "consent") {
      return { success: false, message: "crm.errors.consentNotApplicable" };
    }
    if (person.consentWithdrawnAt == null) {
      return { success: false, message: "crm.errors.consentNotWithdrawn" };
    }

    await prisma.person.update({
      where: { id: personId, userId: user.id },
      data: {
        consentWithdrawnAt: null,
        updatedBySource: "manual",
        updatedByName: user.name,
      },
    });

    eventBus.publish(
      createEvent(DomainEventType.ContactUpdated, { personId, userId: user.id }),
    );

    return { success: true, data: { id: personId }, message: "crm.consentReinstatedSuccess" };
  } catch (error) {
    return handleError(error, "crm.errors.reinstateConsent");
  }
}

export async function anonymizePerson(personId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const person = await prisma.person.findFirst({
      where: { id: personId, userId: user.id },
    });
    if (!person) return { success: false, message: "crm.errors.personNotFound" };
    if (person.status === "anonymized") {
      return { success: false, message: "crm.errors.alreadyAnonymized" };
    }

    // Collect person emails for blocklist cleanup (before anonymization clears them)
    const personEmails = parseEmails(person.emails)
      .map((e) => e.email.trim().toLowerCase());

    // Transaction: anonymize person + cascade delete targets (GDPR Art. 17)
    await prisma.$transaction([
      // Remove note targets (ADR-015: scoped via note.userId — CrmNoteTarget has no userId column)
      prisma.crmNoteTarget.deleteMany({ where: { targetPersonId: personId, note: { userId: user.id } } }),
      // Remove task targets (ADR-015: scoped via task.userId — CrmTaskTarget has no userId column)
      prisma.crmTaskTarget.deleteMany({ where: { targetPersonId: personId, task: { userId: user.id } } }),
      // Remove job contacts (Kette C) (ADR-015: userId in where)
      prisma.jobContact.deleteMany({ where: { personId, userId: user.id } }),
      // Detach interviews + scrub free-text fields (G2 fix, ADR-015: userId in where)
      prisma.crmInterview.updateMany({
        where: { personId, userId: user.id },
        data: {
          personId: null,
          notes: null,
          outcomeNotes: null,
          // Welle 3 (Gap-7): the erasing user is the actor of this cascade edit.
          updatedByType: "user",
          updatedById: user.id,
        },
      }),
      // Anonymize activity log references + scrub PII text fields (S5 fix, ADR-015: userId in where)
      prisma.crmActivityLog.updateMany({
        where: { targetPersonId: personId, userId: user.id },
        data: { targetPersonId: null, details: null, linkedRecordName: null },
      }),
      // Remove blocklist entries for this person's emails/phones (S5 fix)
      ...(personEmails.length > 0
        ? [prisma.crmBlocklist.deleteMany({
            where: { userId: user.id, handle: { in: personEmails } },
          })]
        : []),
      // Inside Track (Welle 5) GDPR cascade — AnonymizeCascadesToInsideTrack
      // (specs/inside-track.allium). Network edges are hard-removed (they exist
      // only to re-identify a path); Referral.viaId is onDelete:SetNull, so any
      // NetworkPath.via pointing at a removed edge is nulled by the DB (G-B).
      prisma.personConnection.deleteMany({
        where: { userId: user.id, OR: [{ fromPersonId: personId }, { toPersonId: personId }] },
      }),
      // G-A: sever the variant-specific Person references (Person row is kept,
      // so the FKs are NOT auto-nulled — do it explicitly).
      prisma.referral.updateMany({
        where: { userId: user.id, forwardedToId: personId },
        data: { forwardedToId: null },
      }),
      prisma.referral.updateMany({
        where: { userId: user.id, insiderId: personId },
        data: { insiderId: null },
      }),
      // Tipster de-identified: a still-working tip is also declined (the
      // door-opener is gone); a terminal tip (converted/declined) keeps its
      // status and only loses the link (avoids an illegal declined->declined).
      prisma.referral.updateMany({
        where: {
          userId: user.id,
          tipsterId: personId,
          status: { notIn: ["converted", "declined"] },
        },
        data: { tipsterId: null, status: "declined" },
      }),
      prisma.referral.updateMany({
        where: {
          userId: user.id,
          tipsterId: personId,
          status: { in: ["converted", "declined"] },
        },
        data: { tipsterId: null },
      }),
      // Anonymize the person record
      prisma.person.update({
        where: { id: personId, userId: user.id },
        data: {
          status: "anonymized",
          firstName: null,
          lastName: null,
          emails: "[]",
          phones: "[]",
          companies: "[]",
          headline: null,
          socialProfiles: "[]",
          avatarUrl: null,
          addressStreet: null,
          addressCity: null,
          addressPostalCode: null,
          addressCountry: null,
          addressCountryCode: null,
          addressSubdivisionCode: null,
          createdByName: null,
          updatedByName: null,
        },
      }),
    ]);

    eventBus.publish(
      createEvent(DomainEventType.ContactDeleted, {
        personId,
        userId: user.id,
        reason: "anonymized",
      }),
    );

    return { success: true, data: { id: personId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function mergePersons(
  winnerId: string,
  loserId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    if (winnerId === loserId) {
      return { success: false, message: "crm.errors.cannotMergeSame" };
    }

    const [winner, loser] = await Promise.all([
      prisma.person.findFirst({ where: { id: winnerId, userId: user.id } }),
      prisma.person.findFirst({ where: { id: loserId, userId: user.id } }),
    ]);

    if (!winner || !loser) return { success: false, message: "crm.errors.personNotFound" };
    if (winner.status !== "active" || loser.status !== "active") {
      return { success: false, message: "crm.errors.mergeBothActive" };
    }

    // Merge loser's emails/phones/companies (append with isPrimary=false)
    const winnerEmails = parseEmails(winner.emails);
    const loserEmails = parseEmails(loser.emails).map((e) => ({ ...e, isPrimary: false }));
    const mergedEmails = [...winnerEmails, ...loserEmails];

    const winnerPhones = parsePhones(winner.phones);
    const loserPhones = parsePhones(loser.phones).map((p) => ({ ...p, isPrimary: false }));
    const mergedPhones = [...winnerPhones, ...loserPhones];

    const winnerCompanies = parseCompanies(winner.companies);
    const loserCompanies = parseCompanies(loser.companies).map((c) => ({ ...c, isPrimary: false }));
    const mergedCompanies = [...winnerCompanies, ...loserCompanies];

    // Pre-read conflicting JobContacts (ADR-015: userId in where)
    const conflictingJobIds = await prisma.jobContact.findMany({
      where: { personId: loserId, userId: user.id },
      select: { jobId: true },
    }).then(rows => rows.map(r => r.jobId));

    const winnerJobIds = new Set(
      await prisma.jobContact.findMany({
        where: { personId: winnerId, userId: user.id },
        select: { jobId: true },
      }).then(rows => rows.map(r => r.jobId))
    );

    const duplicateJobIds = conflictingJobIds.filter(id => winnerJobIds.has(id));

    // G25: dedup CrmTaskTarget / CrmNoteTarget the same way. A task/note that
    // targets BOTH loser and winner would, after the loser→winner transfer,
    // leave TWO winner rows for the same task/note. Neither model has a
    // @@unique, so this is a silent logical duplicate (not a P2002). Pre-read
    // the overlapping task/note IDs (ADR-015: scoped via task.userId / note.userId,
    // since these join tables have no userId column) and delete the loser's
    // colliding rows inside the same transaction before the transfer.
    const loserTaskIds = await prisma.crmTaskTarget.findMany({
      where: { targetPersonId: loserId, task: { userId: user.id } },
      select: { taskId: true },
    }).then(rows => rows.map(r => r.taskId));
    const winnerTaskIds = new Set(
      await prisma.crmTaskTarget.findMany({
        where: { targetPersonId: winnerId, task: { userId: user.id } },
        select: { taskId: true },
      }).then(rows => rows.map(r => r.taskId))
    );
    const duplicateTaskIds = loserTaskIds.filter(id => winnerTaskIds.has(id));

    const loserNoteIds = await prisma.crmNoteTarget.findMany({
      where: { targetPersonId: loserId, note: { userId: user.id } },
      select: { noteId: true },
    }).then(rows => rows.map(r => r.noteId));
    const winnerNoteIds = new Set(
      await prisma.crmNoteTarget.findMany({
        where: { targetPersonId: winnerId, note: { userId: user.id } },
        select: { noteId: true },
      }).then(rows => rows.map(r => r.noteId))
    );
    const duplicateNoteIds = loserNoteIds.filter(id => winnerNoteIds.has(id));

    // Finding 9 fix: dedup delete inside transaction to prevent race condition
    await prisma.$transaction([
      // Remove conflicting JobContacts BEFORE transfer (prevents P2002 on unique constraint, ADR-015: userId in where)
      ...(duplicateJobIds.length > 0
        ? [prisma.jobContact.deleteMany({ where: { personId: loserId, userId: user.id, jobId: { in: duplicateJobIds } } })]
        : []),
      // G25: remove the loser's colliding task/note targets BEFORE transfer so
      // a task/note targeting both persons does not end up with two winner rows.
      ...(duplicateTaskIds.length > 0
        ? [prisma.crmTaskTarget.deleteMany({ where: { targetPersonId: loserId, taskId: { in: duplicateTaskIds }, task: { userId: user.id } } })]
        : []),
      ...(duplicateNoteIds.length > 0
        ? [prisma.crmNoteTarget.deleteMany({ where: { targetPersonId: loserId, noteId: { in: duplicateNoteIds }, note: { userId: user.id } } })]
        : []),
      // Transfer interviews (ADR-015: userId in where)
      prisma.crmInterview.updateMany({
        where: { personId: loserId, userId: user.id },
        data: {
          personId: winnerId,
          // Welle 3 (Gap-7): the merging user is the actor of this transfer.
          updatedByType: "user",
          updatedById: user.id,
        },
      }),
      // Transfer task targets (ADR-015: scoped via task.userId — CrmTaskTarget has no userId column)
      prisma.crmTaskTarget.updateMany({
        where: { targetPersonId: loserId, task: { userId: user.id } },
        data: { targetPersonId: winnerId },
      }),
      // Transfer note targets (ADR-015: scoped via note.userId — CrmNoteTarget has no userId column)
      prisma.crmNoteTarget.updateMany({
        where: { targetPersonId: loserId, note: { userId: user.id } },
        data: { targetPersonId: winnerId },
      }),
      // Transfer job contacts (Kette C, ADR-015: userId in where)
      prisma.jobContact.updateMany({
        where: { personId: loserId, userId: user.id },
        data: { personId: winnerId },
      }),
      // Transfer activity logs (ADR-015: userId in where)
      prisma.crmActivityLog.updateMany({
        where: { targetPersonId: loserId, userId: user.id },
        data: { targetPersonId: winnerId },
      }),
      // Update winner with merged data (ADR-015: userId in where)
      prisma.person.update({
        where: { id: winnerId, userId: user.id },
        data: {
          emails: JSON.stringify(mergedEmails),
          phones: JSON.stringify(mergedPhones),
          companies: JSON.stringify(mergedCompanies),
        },
      }),
      // Delete loser (ADR-015: userId in where)
      prisma.person.delete({ where: { id: loserId, userId: user.id } }),
    ]);

    eventBus.publish(
      createEvent(DomainEventType.ContactDeleted, {
        personId: loserId,
        userId: user.id,
        reason: "merged",
      }),
    );

    return { success: true, data: { id: winnerId } };
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// Reference-data lookups (GeoCode 1.21 / Holiday 1.22) moved to
// src/actions/reference-data.actions.ts — they are NOT part of the Person
// aggregate Repository. Import from there instead.
// ---------------------------------------------------------------------------
