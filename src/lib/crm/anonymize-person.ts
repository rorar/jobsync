import "server-only";

/**
 * Anonymize Person cascade — extracted server-only erasure logic.
 *
 * Accepts a raw userId (no session required) — called by:
 *   - anonymizePerson() (server action, after session + ownership checks)
 *   - expireAutoCreatedPersons() cron rule (no session)
 *
 * ADR-019: NOT a server action export. Lives in a `server-only` file, exactly
 * like src/lib/account/execute-deletion.ts (the precedent this file copies).
 * ADR-015: every `where` below carries `userId` — the caller supplies it from
 * `getCurrentUser()` or, for the cron, from the row it already owns.
 *
 * The CALLER owns the pre-flight checks (ownership lookup, the `anonymized`
 * terminal-status guard). This function performs the cascade unconditionally.
 */

import prisma from "@/lib/db";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
import { extractEmailDomain } from "@/lib/crm/blocklist-match";
import { collectOrphanCandidateNoteIds, withOrphanedCrmPrune } from "@/lib/crm/orphan-targets";
import { parseEmails, parsePhones } from "@/models/person.model";

/** Why this Person is being erased — carried into ContactDeleted + the audit row. */
export type AnonymizeReason = "anonymized" | "retention_expired";

export interface AnonymizePersonOptions {
  /**
   * Distinguishes user-initiated erasure from automatic retention expiry in the
   * ContactDeleted audit trail. Defaults to "anonymized" (the user-initiated case).
   */
  reason?: AnonymizeReason;
  /**
   * Denormalised actor email for the audit row. A cron has no session and so
   * passes null — `DataAuditInput.actorEmail` already accepts that.
   */
  actorEmail?: string | null;
}

/**
 * Erase a Person in place (GDPR Art. 17) and cascade to every record that could
 * re-identify them. The Person row survives as a tombstone in the terminal
 * `anonymized` status; every PII-bearing field on it and on its dependents is
 * cleared or scrubbed.
 *
 * Spec: specs/crm.allium rule AnonymizePerson.
 */
export async function anonymizePersonCascade(
  userId: string,
  personId: string,
  person: { emails: string; phones: string },
  options: AnonymizePersonOptions = {},
): Promise<void> {
  const reason: AnonymizeReason = options.reason ?? "anonymized";
  const actorEmail = options.actorEmail ?? null;

    // Collect the person's blocklist handles before anonymization clears them.
    // W-C3: the spec removes entries matching an email OR its domain, and the
    // phone arm too — not exact emails only. Build the full handle set: exact
    // emails, exact phones, and the domain of each email (which matches a
    // `domain`-type blocklist entry stored as the bare domain handle).
    const personEmails = parseEmails(person.emails).map((e) => e.email.trim().toLowerCase());
    const personPhones = parsePhones(person.phones).map((p) => p.number.trim().toLowerCase());
    const personEmailDomains = personEmails
      .map((e) => extractEmailDomain(e))
      .filter((d): d is string => d !== null);
    const blockedHandles = [...new Set([...personEmails, ...personPhones, ...personEmailDomains])];

    // Collect BEFORE the transaction removes this person's note targets.
    const orphanCandidates = await collectOrphanCandidateNoteIds(prisma, userId, {
      targetPersonId: personId,
    });

    // GDPR Art. 17 (W-D4): a note or task that ALSO targets a Job or Company
    // survives the target removal below — the prune only reaps records left with
    // NO target — and keeps its free text about the erased person. That text is
    // unreachable in the UI, but the Art. 15 export still emits it: it reads
    // `crmNote.findMany({ where: { userId } })` with no target filter
    // (src/lib/export/collect-user-data.ts). Retaining it would be ongoing
    // disclosure of data that was supposed to be erased, so scrub the free text
    // here, mirroring the crmInterview.notes/outcomeNotes treatment below.
    //
    // Tasks are scrubbed rather than deleted: rule DeleteTask (crm.allium)
    // permits a hard delete only from a terminal status, and the board renders
    // the targetless case, so the row must survive — but its title/description
    // may name the erased person, and it keeps firing overdue reminders.
    const piiTaskIds = (
      await prisma.crmTaskTarget.findMany({
        where: { targetPersonId: personId, task: { userId } },
        select: { taskId: true },
      })
    ).map((t) => t.taskId);

    // Transaction: anonymize person + cascade delete targets (GDPR Art. 17)
    await prisma.$transaction(
      // W-D3 (GDPR Art. 17): removing the note targets above can leave a note
      // that ONLY targeted this person with zero targets — unreachable in the UI,
      // yet still holding free text about the erased person. withOrphanedCrmPrune
      // appends that prune after every statement below. Tasks are left alone (they
      // stay visible on the board) — see the orphan-targets module docs.
      withOrphanedCrmPrune(prisma, userId, orphanCandidates, [
        // GDPR Art. 17: scrub the free text BEFORE the targets go, while the
        // collected ids still describe records that named this person. `body` is
        // non-nullable, so it is emptied rather than nulled. (ADR-015: userId in
        // where — the id list is not trusted on its own.)
        prisma.crmNote.updateMany({
          where: { id: { in: orphanCandidates }, userId },
          data: {
            title: null,
            body: "",
            updatedByType: "system",
            updatedById: userId,
          },
        }),
        prisma.crmTask.updateMany({
          where: { id: { in: piiTaskIds }, userId },
          data: {
            title: "",
            description: null,
            updatedByType: "system",
            updatedById: userId,
          },
        }),
        // Remove note targets (ADR-015: scoped via note.userId — CrmNoteTarget has no userId column)
        prisma.crmNoteTarget.deleteMany({ where: { targetPersonId: personId, note: { userId } } }),
        // Remove task targets (ADR-015: scoped via task.userId — CrmTaskTarget has no userId column)
        prisma.crmTaskTarget.deleteMany({ where: { targetPersonId: personId, task: { userId } } }),
        // Remove job contacts (Kette C) (ADR-015: userId in where)
        prisma.jobContact.deleteMany({ where: { personId, userId } }),
        // Detach interviews + scrub free-text fields (G2 fix, ADR-015: userId in where)
        prisma.crmInterview.updateMany({
          where: { personId, userId },
          data: {
            personId: null,
            notes: null,
            outcomeNotes: null,
            // Welle 3 (Gap-7): the erasing user is the actor of this cascade edit.
            // W-B3: except on retention expiry, where the cron has no human
            // actor — claiming "user" there would put a false attribution in the
            // record, so it is attributed to the system like the Person row is.
            updatedByType: reason === "retention_expired" ? "system" : "user",
            updatedById: userId,
          },
        }),
        // Anonymize activity log references + scrub PII text fields (S5 fix, ADR-015: userId in where)
        prisma.crmActivityLog.updateMany({
          where: { targetPersonId: personId, userId },
          data: { targetPersonId: null, details: null, linkedRecordName: null },
        }),
        // Remove blocklist entries for this person's emails, phones, and email
        // domains (S5 fix + W-C3 domain/phone arms).
        ...(blockedHandles.length > 0
          ? [prisma.crmBlocklist.deleteMany({
              where: { userId, handle: { in: blockedHandles } },
            })]
          : []),
        // Inside Track (Welle 5) GDPR cascade — AnonymizeCascadesToInsideTrack
        // (specs/inside-track.allium). Network edges are hard-removed (they exist
        // only to re-identify a path); Referral.viaId is onDelete:SetNull, so any
        // NetworkPath.via pointing at a removed edge is nulled by the DB (G-B).
        prisma.personConnection.deleteMany({
          where: { userId, OR: [{ fromPersonId: personId }, { toPersonId: personId }] },
        }),
        // G-A: sever the variant-specific Person references (Person row is kept,
        // so the FKs are NOT auto-nulled — do it explicitly).
        prisma.referral.updateMany({
          where: { userId, forwardedToId: personId },
          data: { forwardedToId: null },
        }),
        prisma.referral.updateMany({
          where: { userId, insiderId: personId },
          data: { insiderId: null },
        }),
        // Tipster de-identified: a still-working tip is also declined (the
        // door-opener is gone); a terminal tip (converted/declined) keeps its
        // status and only loses the link (avoids an illegal declined->declined).
        prisma.referral.updateMany({
          where: {
            userId,
            tipsterId: personId,
            status: { notIn: ["converted", "declined"] },
          },
          data: { tipsterId: null, status: "declined" },
        }),
        prisma.referral.updateMany({
          where: {
            userId,
            tipsterId: personId,
            status: { in: ["converted", "declined"] },
          },
          data: { tipsterId: null },
        }),
        // Anonymize the person record
        prisma.person.update({
          where: { id: personId, userId },
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
            // W-C4: the erasure is a system action, not a human edit — record it
            // so the tombstone does not claim a person last touched the record.
            updatedBySource: "system",
          },
        }),
      ]),
    );

    // GDPR Art. 5(2) accountability: the erasure is the action a controller is
    // most likely to have to demonstrate, and it was the only mutation here
    // leaving no attributable trace — the contact_deleted timeline projection
    // deliberately nulls the person reference, so it cannot serve as the record.
    // The entry names the subject and the actor and nothing else: the sink drops
    // any snapshot for a non-SNAPSHOT_ACTION, so an erasure can never preserve
    // the PII it removed (spec: audit-trail.allium, rule AuditPersonAnonymise).
    writeDataAuditLog({
      actorId: userId,
      actorEmail,
      action: "person.anonymize",
      targetType: "person",
      targetId: personId,
    });

    eventBus.publish(
      createEvent(DomainEventType.ContactDeleted, {
        personId,
        userId,
        reason,
      }),
    );

}
