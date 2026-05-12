"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import {
  type TypedEmail,
  type TypedPhone,
  type CompanyAssociation,
  type SocialProfile,
  type PersonStatus,
  type DataSource,
  type ProcessingBasis,
  type ActorSource,
  isValidPersonTransition,
  validateExactlyOneTarget,
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

    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 25;
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

    // Transaction: anonymize person + cascade delete targets
    await prisma.$transaction([
      // Remove note targets
      prisma.crmNoteTarget.deleteMany({ where: { targetPersonId: personId } }),
      // Remove task targets
      prisma.crmTaskTarget.deleteMany({ where: { targetPersonId: personId } }),
      // Remove job contacts (Kette C)
      prisma.jobContact.deleteMany({ where: { personId } }),
      // Anonymize activity log references
      prisma.crmActivityLog.updateMany({
        where: { targetPersonId: personId },
        data: { targetPersonId: null },
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

    // Pre-read conflicting JobContacts (read-only, safe outside transaction)
    const conflictingJobIds = await prisma.jobContact.findMany({
      where: { personId: loserId },
      select: { jobId: true },
    }).then(rows => rows.map(r => r.jobId));

    const winnerJobIds = new Set(
      await prisma.jobContact.findMany({
        where: { personId: winnerId },
        select: { jobId: true },
      }).then(rows => rows.map(r => r.jobId))
    );

    const duplicateJobIds = conflictingJobIds.filter(id => winnerJobIds.has(id));

    // Finding 9 fix: dedup delete inside transaction to prevent race condition
    await prisma.$transaction([
      // Remove conflicting JobContacts BEFORE transfer (prevents P2002 on unique constraint)
      ...(duplicateJobIds.length > 0
        ? [prisma.jobContact.deleteMany({ where: { personId: loserId, jobId: { in: duplicateJobIds } } })]
        : []),
      // Transfer interviews
      prisma.crmInterview.updateMany({
        where: { personId: loserId },
        data: { personId: winnerId },
      }),
      // Transfer task targets
      prisma.crmTaskTarget.updateMany({
        where: { targetPersonId: loserId },
        data: { targetPersonId: winnerId },
      }),
      // Transfer note targets
      prisma.crmNoteTarget.updateMany({
        where: { targetPersonId: loserId },
        data: { targetPersonId: winnerId },
      }),
      // Transfer job contacts (Kette C)
      prisma.jobContact.updateMany({
        where: { personId: loserId },
        data: { personId: winnerId },
      }),
      // Transfer activity logs
      prisma.crmActivityLog.updateMany({
        where: { targetPersonId: loserId },
        data: { targetPersonId: winnerId },
      }),
      // Update winner with merged data
      prisma.person.update({
        where: { id: winnerId },
        data: {
          emails: JSON.stringify(mergedEmails),
          phones: JSON.stringify(mergedPhones),
          companies: JSON.stringify(mergedCompanies),
        },
      }),
      // Delete loser
      prisma.person.delete({ where: { id: loserId } }),
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
