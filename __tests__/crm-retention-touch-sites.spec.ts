/**
 * crm-retention-touch-sites.spec.ts — the last-activity retention clock wiring.
 *
 * `specs/crm.allium invariant AutoCreatedHasRetention` says the retention clock
 * is a LAST-ACTIVITY clock. That is only true if every interaction the design
 * counts as "activity" actually re-bases `Person.retentionExpiresAt`. Before
 * this suite the clock was wired at ONE site (`updatePerson`), so an
 * auto-created contact worked with through notes, tasks and interviews for two
 * years was still erased on the anniversary of the last NAME edit.
 *
 * These are WIRING tests: `@/lib/crm/retention-policy` is mocked and the
 * assertion is "this action asks the clock to advance for these person ids".
 * The clock's own arithmetic, ADR-015 scoping and `auto_created` filtering are
 * covered by `__tests__/crm-retention-policy.spec.ts` — not restated here.
 *
 * The negative case matters as much as the positives: `archivePerson` MUST NOT
 * advance the clock. Archiving means "I no longer need this contact"; letting it
 * extend retention would invert the Art. 5(1)(e) necessity test.
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    person: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    job: { findFirst: jest.fn() },
    company: { findFirst: jest.fn() },
    jobContact: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    crmNote: { create: jest.fn() },
    crmTask: { create: jest.fn(), count: jest.fn() },
    crmInterview: { create: jest.fn() },
    personConnection: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    referral: { create: jest.fn() },
  },
}));
jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/audit/data-audit", () => ({ writeDataAuditLog: jest.fn() }));
jest.mock("@/lib/crm/resolve-applied-status", () => ({ resolveAppliedStatusId: jest.fn() }));
jest.mock("@/lib/events", () => ({
  eventBus: { publish: jest.fn() },
  emitEvent: jest.fn(),
  createEvent: jest.fn((type: string, payload: unknown) => ({ type, payload })),
  DomainEventTypes: { ReferralRecorded: "ReferralRecorded" },
}));
jest.mock("@/lib/crm/retention-policy", () => ({
  touchPersonRetention: jest.fn().mockResolvedValue(undefined),
  touchPersonsRetention: jest.fn().mockResolvedValue(undefined),
}));

import db from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import {
  touchPersonRetention,
  touchPersonsRetention,
} from "@/lib/crm/retention-policy";
import { archivePerson, reactivatePerson } from "@/actions/person.actions";
import { addJobContact, removeJobContact } from "@/actions/jobContact.actions";
import { createCrmNote } from "@/actions/crmNote.actions";
import { createCrmTask } from "@/actions/crmTask.actions";
import { scheduleInterview } from "@/actions/crmInterview.actions";
import { addPersonConnection } from "@/actions/personConnection.actions";
import { recordInsiderTip, recordNetworkTip } from "@/actions/referral.actions";

const prisma = db as unknown as Record<string, Record<string, jest.Mock>>;
const touchOne = touchPersonRetention as jest.Mock;
const touchMany = touchPersonsRetention as jest.Mock;
const user = { id: "user-1", name: "U", email: "u@x.io" };

/** A Person that passes the ownership + Art. 7(3) consent guards. */
const consenting = {
  id: "p1",
  status: "active",
  processingBasis: "legitimate_interest",
  consentWithdrawnAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUser as jest.Mock).mockResolvedValue(user);
  touchOne.mockResolvedValue(undefined);
  touchMany.mockResolvedValue(undefined);
});

/** The ids the action asked the clock to advance, flattened across both helpers. */
function touchedIds(): string[] {
  const single = touchOne.mock.calls.map((c) => c[1] as string);
  const plural = touchMany.mock.calls.flatMap((c) => (c[1] as string[]) ?? []);
  return [...single, ...plural];
}

// ---------------------------------------------------------------------------
// person.actions.ts
// ---------------------------------------------------------------------------

describe("person.actions", () => {
  it("reactivatePerson advances the clock — un-archiving is the most explicit 'still needed' signal", async () => {
    prisma.person.findFirst.mockResolvedValue({ ...consenting, status: "archived" });
    prisma.person.update.mockResolvedValue({ id: "p1" });

    const res = await reactivatePerson("p1");

    expect(res.success).toBe(true);
    expect(touchOne).toHaveBeenCalledWith("user-1", "p1");
  });

  it("REGRESSION: archivePerson does NOT advance the clock", async () => {
    prisma.person.findFirst.mockResolvedValue({ ...consenting, status: "active" });
    prisma.person.update.mockResolvedValue({ id: "p1" });

    const res = await archivePerson("p1");

    // Archiving means "no longer needed" — the opposite of the necessity signal
    // the clock measures. If this ever fails, filing a contact away has started
    // extending how long it is kept (docs/wh-b3-retention-analysis.md §4.7).
    expect(res.success).toBe(true);
    expect(touchOne).not.toHaveBeenCalled();
    expect(touchMany).not.toHaveBeenCalled();
  });

  it("does not advance the clock when reactivation is rejected by the state machine", async () => {
    prisma.person.findFirst.mockResolvedValue({ ...consenting, status: "anonymized" });

    const res = await reactivatePerson("p1");

    expect(res.success).toBe(false);
    expect(touchOne).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// jobContact.actions.ts
// ---------------------------------------------------------------------------

describe("addJobContact", () => {
  it("advances the clock for the linked contact", async () => {
    prisma.job.findFirst.mockResolvedValue({ id: "job-1" });
    prisma.person.findFirst.mockResolvedValue(consenting);
    prisma.jobContact.create.mockResolvedValue({ id: "jc-1" });

    const res = await addJobContact("job-1", "p1", "recruiter");

    expect(res.success).toBe(true);
    expect(touchOne).toHaveBeenCalledWith("user-1", "p1");
  });

  it("does not advance the clock for a consent-blocked contact (guard fires first)", async () => {
    prisma.job.findFirst.mockResolvedValue({ id: "job-1" });
    prisma.person.findFirst.mockResolvedValue({
      ...consenting,
      processingBasis: "consent",
      consentWithdrawnAt: new Date(),
    });

    const res = await addJobContact("job-1", "p1");

    expect(res.success).toBe(false);
    expect(res.message).toBe("crm.errors.consentWithdrawn");
    expect(touchOne).not.toHaveBeenCalled();
  });

  it("removeJobContact does NOT advance the clock — unlinking is not activity", async () => {
    prisma.jobContact.findFirst.mockResolvedValue({
      id: "jc-1",
      personId: "p1",
      jobId: "job-1",
    });
    prisma.jobContact.delete.mockResolvedValue({ id: "jc-1" });

    const res = await removeJobContact("jc-1");

    expect(res.success).toBe(true);
    expect(touchOne).not.toHaveBeenCalled();
    expect(touchMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// crmNote.actions.ts / crmTask.actions.ts — polymorphic targets
// ---------------------------------------------------------------------------

describe("createCrmNote", () => {
  it("advances the clock for EVERY person target, not just the first", async () => {
    prisma.person.findFirst
      .mockResolvedValueOnce({ ...consenting, id: "p1" })
      .mockResolvedValueOnce({ ...consenting, id: "p2" });
    prisma.crmNote.create.mockResolvedValue({ id: "n1" });

    const res = await createCrmNote({
      body: "spoke to both",
      targets: [{ targetPersonId: "p1" }, { targetPersonId: "p2" }],
    });

    expect(res.success).toBe(true);
    expect(touchMany).toHaveBeenCalledWith("user-1", ["p1", "p2"]);
  });

  it("passes no person ids for a job-only note", async () => {
    prisma.job.findFirst.mockResolvedValue({ id: "job-1" });
    prisma.crmNote.create.mockResolvedValue({ id: "n1" });

    const res = await createCrmNote({ body: "job note", targets: [{ targetJobId: "job-1" }] });

    expect(res.success).toBe(true);
    // The helper is still called, with only nullish ids — it drops them itself.
    expect(touchMany).toHaveBeenCalledWith("user-1", [undefined]);
    expect(touchedIds()).toEqual([]);
  });
});

describe("createCrmTask", () => {
  it("advances the clock for the person target — a task asserts a FUTURE need", async () => {
    prisma.person.findFirst.mockResolvedValue(consenting);
    prisma.crmTask.count.mockResolvedValue(0);
    prisma.crmTask.create.mockResolvedValue({ id: "t1" });

    const res = await createCrmTask({ title: "follow up", targets: [{ targetPersonId: "p1" }] });

    expect(res.success).toBe(true);
    expect(touchMany).toHaveBeenCalledWith("user-1", ["p1"]);
  });

  it("does not advance the clock when the per-user task cap rejects the create", async () => {
    prisma.person.findFirst.mockResolvedValue(consenting);
    prisma.crmTask.count.mockResolvedValue(1_000_000);

    const res = await createCrmTask({ title: "follow up", targets: [{ targetPersonId: "p1" }] });

    expect(res.success).toBe(false);
    expect(touchMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// crmInterview.actions.ts
// ---------------------------------------------------------------------------

describe("scheduleInterview", () => {
  it("advances the clock for the interviewee", async () => {
    prisma.job.findFirst.mockResolvedValue({ id: "job-1", description: "", JobTitle: { label: "X" } });
    prisma.person.findFirst.mockResolvedValue(consenting);
    prisma.crmInterview.create.mockResolvedValue({ id: "i1" });

    const res = await scheduleInterview({
      jobId: "job-1",
      personId: "p1",
      interviewDate: "2026-09-01T10:00:00.000Z",
    });

    expect(res.success).toBe(true);
    expect(touchOne).toHaveBeenCalledWith("user-1", "p1");
  });

  it("touches nothing when the interview has no Person attached", async () => {
    prisma.job.findFirst.mockResolvedValue({ id: "job-1", description: "", JobTitle: { label: "X" } });
    prisma.crmInterview.create.mockResolvedValue({ id: "i1" });

    const res = await scheduleInterview({
      jobId: "job-1",
      interviewDate: "2026-09-01T10:00:00.000Z",
    });

    expect(res.success).toBe(true);
    expect(touchOne).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// personConnection.actions.ts
// ---------------------------------------------------------------------------

describe("addPersonConnection", () => {
  it("advances the clock for BOTH endpoints of the edge", async () => {
    prisma.person.findMany.mockResolvedValue([
      { id: "a", processingBasis: "legitimate_interest", consentWithdrawnAt: null },
      { id: "b", processingBasis: "legitimate_interest", consentWithdrawnAt: null },
    ]);
    prisma.personConnection.findFirst.mockResolvedValue(null);
    prisma.personConnection.count.mockResolvedValue(0);
    prisma.personConnection.create.mockResolvedValue({ id: "c1" });

    const res = await addPersonConnection({
      fromPersonId: "a",
      toPersonId: "b",
      kind: "former_colleague",
      strength: "close",
    });

    expect(res.success).toBe(true);
    expect(touchMany).toHaveBeenCalledWith("user-1", ["a", "b"]);
  });

  it("does not advance the clock when a duplicate edge is rejected", async () => {
    prisma.person.findMany.mockResolvedValue([
      { id: "a", processingBasis: "legitimate_interest", consentWithdrawnAt: null },
      { id: "b", processingBasis: "legitimate_interest", consentWithdrawnAt: null },
    ]);
    prisma.personConnection.findFirst.mockResolvedValue({ id: "existing" });

    const res = await addPersonConnection({
      fromPersonId: "a",
      toPersonId: "b",
      kind: "former_colleague",
      strength: "close",
    });

    expect(res.success).toBe(false);
    expect(touchMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// referral.actions.ts
// ---------------------------------------------------------------------------

describe("referral recording", () => {
  it("recordInsiderTip advances the clock for tipster and forwarded-to", async () => {
    prisma.person.findFirst.mockResolvedValue({
      processingBasis: "legitimate_interest",
      consentWithdrawnAt: null,
    });
    prisma.referral.create.mockResolvedValue({ id: "r1" });

    const res = await recordInsiderTip({ tipsterId: "p1", forwardedToId: "p2" });

    expect(res.success).toBe(true);
    expect(touchMany).toHaveBeenCalledWith("user-1", ["p1", "p2"]);
  });

  it("recordInsiderTip passes a nullish forwarded-to through untouched", async () => {
    prisma.person.findFirst.mockResolvedValue({
      processingBasis: "legitimate_interest",
      consentWithdrawnAt: null,
    });
    prisma.referral.create.mockResolvedValue({ id: "r1" });

    const res = await recordInsiderTip({ tipsterId: "p1" });

    expect(res.success).toBe(true);
    expect(touchedIds()).toEqual(["p1"]);
  });

  it("recordNetworkTip advances the clock for tipster and insider", async () => {
    prisma.person.findFirst.mockResolvedValue({
      processingBasis: "legitimate_interest",
      consentWithdrawnAt: null,
    });
    prisma.personConnection.findFirst.mockResolvedValue(null);
    prisma.referral.create.mockResolvedValue({ id: "r2" });

    const res = await recordNetworkTip({ tipsterId: "p1", insiderId: "p2" });

    expect(res.success).toBe(true);
    expect(touchMany).toHaveBeenCalledWith("user-1", ["p1", "p2"]);
  });
});
