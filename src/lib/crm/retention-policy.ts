import "server-only";

/**
 * CRM retention policy — the user-configurable half of
 * `specs/crm.allium rule ExpireAutoCreatedPersons`.
 *
 * Accepts a raw `userId` (no session required) — called by:
 *   - `expireAutoCreatedPersons()` cron rule (no session)
 *   - `updatePerson()` server action (after its own session check)
 *   - `updatePrivacySettings()` server action (after its own session check)
 *
 * ADR-019: NOT a server action export. Lives in a `server-only` leaf, exactly
 * like `src/lib/account/execute-deletion.ts` and `src/lib/account/privacy-helpers.ts`.
 * ADR-015: every query below carries `userId` in its `where`.
 *
 * ---------------------------------------------------------------------------
 * What "disabled" means (deliberate, see docs/retention-settings-plan.md D2)
 * ---------------------------------------------------------------------------
 * `crmRetentionEnabled: false` suspends the automatic ERASURE only. The period
 * stays declared, `retentionExpiresAt` is still written and still advanced, and
 * the contact still shows its expiry date. Art. 5(1)(e) storage limitation
 * applies to the operator regardless of what this software does unattended, so
 * deleting the policy along with the automation would make the accountability
 * story (Art. 5(2)) worse, not better. There is no "unlimited" period on
 * purpose — see PrivacySettings.crmRetentionDays.
 */

import prisma from "@/lib/db";
import { getPrivacySettingsForUser } from "@/lib/account/privacy-helpers";
import { debugError } from "@/lib/debug";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CrmRetentionPolicy {
  /** Whether expiry ERASES automatically. Never means "retain forever" when false. */
  enabled: boolean;
  /** Declared retention period in days. Always set, enabled or not. */
  days: number;
}

/** Read the effective CRM retention policy for a user. Never throws. */
export async function getCrmRetentionPolicy(
  userId: string,
): Promise<CrmRetentionPolicy> {
  const privacy = await getPrivacySettingsForUser(userId);
  return {
    enabled: privacy.crmRetentionEnabled,
    days: privacy.crmRetentionDays,
  };
}

/** Deadline `days` from `from`. Pure — no I/O, safe to unit-test directly. */
export function retentionDeadline(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/**
 * The value an auto-creation writer MUST persist into `Person.retentionExpiresAt`
 * to satisfy `crm.allium invariant AutoCreatedHasRetention`.
 *
 * Returns a date even when the policy is disabled: the deadline is the declared
 * policy, and disabling only suspends acting on it (see the module header).
 */
export async function computeRetentionExpiry(
  userId: string,
  from: Date = new Date(),
): Promise<Date> {
  const { days } = await getCrmRetentionPolicy(userId);
  return retentionDeadline(from, days);
}

/**
 * Shared body of the last-activity clock. `idFilter` is either a single id or a
 * Prisma `{ in: [...] }` filter, so one and many Persons take the same path.
 */
async function applyRetentionTouch(
  userId: string,
  idFilter: string | { in: string[] },
  now: Date,
): Promise<void> {
  try {
    const { days } = await getCrmRetentionPolicy(userId);
    // ADR-015: userId in the where. `updateMany` (not `update`) so a Person that
    // is manual/quick_capture simply matches nothing instead of throwing.
    await prisma.person.updateMany({
      where: { id: idFilter, userId, dataSource: "auto_created" },
      data: { retentionExpiresAt: retentionDeadline(now, days) },
    });
  } catch (error) {
    debugError("crm-retention", "retention touch failed:", error);
  }
}

/**
 * Last-activity clock (analysis option (e)): a substantive interaction with an
 * auto-created Person re-bases its deadline, so the period tracks necessity
 * instead of approximating it from the creation date.
 *
 * Scoped to `dataSource: "auto_created"` — manual and quick_capture Persons have
 * no retention leash today (`quick_capture` is an open question in crm.allium).
 * Best-effort: a failure here must never fail the caller's edit.
 *
 * ---------------------------------------------------------------------------
 * WHAT COUNTS AS ACTIVITY (the W-B3 follow-up decision, 2026-08-30)
 * ---------------------------------------------------------------------------
 * The clock advances when a deliberate act by the AUTHENTICATED USER creates a
 * NEW DURABLE ASSOCIATION with that specific Person — or refreshes the Person
 * record itself. System-driven writes never count; acts that END or wind down
 * the association never count.
 *
 * Both limbs matter under Art. 5(1)(e). An interaction is admissible evidence
 * that the controller still NEEDS the data only if it is intentional (otherwise
 * it measures system churn, not necessity) and constitutive (it advances the
 * purpose rather than merely observing the record).
 *
 * Wired at, and only at:
 *   updatePerson, reactivatePerson      (src/actions/person.actions.ts)
 *   addJobContact                       (src/actions/jobContact.actions.ts)
 *   createCrmNote  — person targets     (src/actions/crmNote.actions.ts)
 *   createCrmTask  — person targets     (src/actions/crmTask.actions.ts)
 *   scheduleInterview — when personId   (src/actions/crmInterview.actions.ts)
 *   addPersonConnection — both ends     (src/actions/personConnection.actions.ts)
 *   recordInsiderTip / recordNetworkTip (src/actions/referral.actions.ts)
 *
 * Deliberately NOT wired: archivePerson (archiving is the opposite of "still
 * needed"), consent withdraw/reinstate (lawfulness, not necessity), lifecycle
 * transitions and removals (ambiguous or negative evidence), and read-only
 * views (a view is evidence of curiosity, not necessity — and Next.js prefetch
 * would advance the clock with no user intent at all). mergePersons is an open
 * question in specs/crm.allium: the winner should arguably inherit
 * max(winner, loser) deadline, which is NOT this operation.
 * Full reasoning: docs/fix-1-clock-notes.md.
 */
export async function touchPersonRetention(
  userId: string,
  personId: string,
  now: Date = new Date(),
): Promise<void> {
  await applyRetentionTouch(userId, personId, now);
}

/**
 * Plural form of {@link touchPersonRetention} for sites that name more than one
 * Person in a single act — a note/task with several person targets, a
 * PersonConnection (two endpoints), a Referral (tipster + insider/forwarded-to).
 *
 * Nullish and duplicate ids are dropped, then all remaining ids are re-based in
 * ONE `updateMany` rather than N round-trips. Same ADR-015 scoping, same
 * `auto_created` filter, same never-throws contract.
 */
export async function touchPersonsRetention(
  userId: string,
  personIds: ReadonlyArray<string | null | undefined>,
  now: Date = new Date(),
): Promise<void> {
  const unique = Array.from(
    new Set(personIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  );
  if (unique.length === 0) return;
  await applyRetentionTouch(userId, { in: unique }, now);
}

/**
 * Re-base every auto-created Person's deadline after the user changes the
 * retention period.
 *
 * Without this the setting would be a lie: an operator shortening 730 -> 180 to
 * be MORE protective would see nothing happen for years — which is exactly the
 * "system does not enforce its own declared policy" defect (Art. 5(2)) that this
 * work exists to fix, re-created as a configuration.
 *
 * The re-base is EXACT and IDEMPOTENT, because it shifts the stored deadline by
 * the delta rather than recomputing it from a timestamp:
 *
 *     newDeadline = oldDeadline - oldDays + newDays
 *
 * `oldDeadline - oldDays` recovers the last-activity instant that produced the
 * stored deadline, whatever it was, so repeatedly saving the settings page
 * cannot walk the clock forward. Recomputing from `Person.updatedAt` WOULD walk
 * it forward — this write bumps `updatedAt`, so the next save would re-base from
 * the previous save. That would let fiddling with the setting extend retention,
 * which is the opposite of the point.
 *
 * Fallback: a row with a null deadline (which `crm.allium invariant
 * AutoCreatedHasRetention` forbids, but defence in depth is cheap) is seeded
 * from `updatedAt + newDays`. That path uses `updatedAt` as a last-activity
 * proxy and so errs toward retaining slightly longer — recorded as an open
 * question in specs/crm.allium; a dedicated `lastActivityAt` column is the
 * correct fix and needs a migration slot.
 *
 * Returns the number of rows re-based. Best-effort: never throws.
 */
export async function rebaseCrmRetention(
  userId: string,
  oldDays: number,
  newDays: number,
): Promise<number> {
  if (oldDays === newDays) return 0;
  const deltaMs = (newDays - oldDays) * MS_PER_DAY;

  try {
    // Bounded by CRM_CONFIG.maxPersonsPerUser (10000) and, in practice, by the
    // fact that nothing creates auto_created Persons yet. Read-then-write is
    // required: SQLite/Prisma `updateMany` cannot do per-row date arithmetic.
    const persons = await prisma.person.findMany({
      where: { userId, dataSource: "auto_created", status: { not: "anonymized" } },
      select: { id: true, updatedAt: true, retentionExpiresAt: true },
    });
    if (persons.length === 0) return 0;

    let rebased = 0;
    for (const person of persons) {
      const next = person.retentionExpiresAt
        ? new Date(person.retentionExpiresAt.getTime() + deltaMs)
        : retentionDeadline(person.updatedAt, newDays);
      try {
        // ADR-015: userId in the where.
        await prisma.person.updateMany({
          where: { id: person.id, userId },
          data: { retentionExpiresAt: next },
        });
        rebased++;
      } catch (error) {
        debugError("crm-retention", `rebase failed for ${person.id}:`, error);
      }
    }
    return rebased;
  } catch (error) {
    debugError("crm-retention", "rebaseCrmRetention failed:", error);
    return 0;
  }
}
