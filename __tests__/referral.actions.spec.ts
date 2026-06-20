/**
 * referral.actions.spec.ts — Welle 5 (Inside Track) Phase 3, Tasks 3.1 + 3.3
 *
 * Referral aggregate Repository: create (insider/network), status-gated
 * transitions, and TipReifiesToJob. SoT: specs/inside-track.allium.
 */
import {
  recordInsiderTip,
  recordNetworkTip,
  engageReferral,
  declineReferral,
  reviveReferral,
  commitReferralToApply,
  getReferral,
  listReferrals,
} from "@/actions/referral.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";
import { resolveAppliedStatusId } from "@/lib/crm/resolve-applied-status";

jest.mock("@prisma/client", () => {
  const m = {
    referral: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    person: { findFirst: jest.fn() },
    company: { findFirst: jest.fn() },
    personConnection: { findFirst: jest.fn() },
    jobTitle: { upsert: jest.fn() },
    job: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/crm/resolve-applied-status", () => ({ resolveAppliedStatusId: jest.fn() }));
jest.mock("@/lib/events", () => ({
  emitEvent: jest.fn(),
  createEvent: jest.fn((type: string, payload: unknown) => ({ type, payload })),
  DomainEventTypes: { JobStatusChanged: "JobStatusChanged" },
}));
jest.mock("@/lib/audit/data-audit", () => ({ writeDataAuditLog: jest.fn() }));

const prisma = new PrismaClient();
const user = { id: "user-1", name: "U", email: "u@x.io" };
beforeEach(() => jest.clearAllMocks());

describe("recordInsiderTip", () => {
  it("rejects unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    expect((await recordInsiderTip({ tipsterId: "p1" })).success).toBe(false);
  });

  it("creates an open insider_relay for an owned, consenting tipster", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ processingBasis: "legitimate_interest", consentWithdrawnAt: null });
    (prisma.referral.create as jest.Mock).mockResolvedValue({ id: "r1" });

    const res = await recordInsiderTip({ tipsterId: "p1", targetCompanyId: null });

    expect(res.success).toBe(true);
    expect(prisma.referral.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", kind: "insider_relay", status: "open", tipsterId: "p1" }),
      }),
    );
  });

  it("rejects a consent-blocked tipster (GDPR Art. 7(3))", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ processingBasis: "consent", consentWithdrawnAt: new Date() });

    const res = await recordInsiderTip({ tipsterId: "p1" });
    expect(res.success).toBe(false);
    expect(res.message).toBe("crm.errors.consentWithdrawn");
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it("rejects when tipster not owned (IDOR)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await recordInsiderTip({ tipsterId: "p1" });
    expect(res.message).toBe("crm.errors.personNotFound");
  });
});

describe("recordNetworkTip", () => {
  it("creates an open network_path", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ processingBasis: "legitimate_interest", consentWithdrawnAt: null });
    (prisma.referral.create as jest.Mock).mockResolvedValue({ id: "r2" });

    const res = await recordNetworkTip({ tipsterId: "p1" });
    expect(res.success).toBe(true);
    expect(prisma.referral.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "network_path", status: "open" }) }),
    );
  });

  // invariant NetworkPathViaConnectsTipsterToInsider (specs/inside-track.allium):
  // if `via` is set, the connection must run tipster -> insider.
  it("rejects a via edge that does not run tipster -> insider", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ processingBasis: "legitimate_interest", consentWithdrawnAt: null });
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue({ fromPersonId: "someone-else", toPersonId: "p2" });

    const res = await recordNetworkTip({ tipsterId: "p1", insiderId: "p2", viaId: "v1" });
    expect(res.success).toBe(false);
    expect(res.message).toBe("crm.errors.invalidConnectionPath");
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it("accepts a via edge that runs tipster -> insider", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ processingBasis: "legitimate_interest", consentWithdrawnAt: null });
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue({ fromPersonId: "p1", toPersonId: "p2" });
    (prisma.referral.create as jest.Mock).mockResolvedValue({ id: "r3" });

    const res = await recordNetworkTip({ tipsterId: "p1", insiderId: "p2", viaId: "v1" });
    expect(res.success).toBe(true);
  });

  it("rejects when the via connection is not found / not owned", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ processingBasis: "legitimate_interest", consentWithdrawnAt: null });
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await recordNetworkTip({ tipsterId: "p1", insiderId: "p2", viaId: "missing" });
    expect(res.message).toBe("crm.errors.connectionNotFound");
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it("rejects when the target company is not owned", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ processingBasis: "legitimate_interest", consentWithdrawnAt: null });
    (prisma.company.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await recordNetworkTip({ tipsterId: "p1", targetCompanyId: "c-not-mine" });
    expect(res.message).toBe("crm.errors.companyNotFound");
    expect(prisma.referral.create).not.toHaveBeenCalled();
  });

  it("auto-links via when a tipster->insider connection exists (no explicit viaId)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ processingBasis: "legitimate_interest", consentWithdrawnAt: null });
    // No explicit viaId; the auto-resolve lookup finds the connecting edge.
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue({ id: "edge-1" });
    (prisma.referral.create as jest.Mock).mockResolvedValue({ id: "r4" });

    const res = await recordNetworkTip({ tipsterId: "p1", insiderId: "p2" });

    expect(res.success).toBe(true);
    expect(prisma.personConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", fromPersonId: "p1", toPersonId: "p2" },
      }),
    );
    expect(prisma.referral.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ viaId: "edge-1" }) }),
    );
  });

  it("leaves via null when no tipster->insider connection exists", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ processingBasis: "legitimate_interest", consentWithdrawnAt: null });
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.referral.create as jest.Mock).mockResolvedValue({ id: "r5" });

    const res = await recordNetworkTip({ tipsterId: "p1", insiderId: "p2" });

    expect(res.success).toBe(true);
    expect(prisma.referral.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ viaId: null }) }),
    );
  });
});

describe("status transitions", () => {
  it("engageReferral: open -> engaged refreshes last_activity_at", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue({ id: "r1", status: "open" });
    (prisma.referral.update as jest.Mock).mockResolvedValue({ id: "r1" });

    const res = await engageReferral("r1");
    expect(res.success).toBe(true);
    const data = (prisma.referral.update as jest.Mock).mock.calls[0][0].data;
    expect(data.status).toBe("engaged");
    expect(data.lastActivityAt).toBeInstanceOf(Date);
  });

  it("rejects an illegal transition (open -> relayed)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue({ id: "r1", status: "open" });
    // engageReferral targets `engaged`; to test relay illegally we drive relayReferral
    const { relayReferral } = await import("@/actions/referral.actions");
    const res = await relayReferral("r1");
    expect(res.success).toBe(false);
    expect(res.message).toBe("crm.errors.invalidTransition");
    expect(prisma.referral.update).not.toHaveBeenCalled();
  });

  it("declineReferral: in_review -> declined", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue({ id: "r1", status: "in_review" });
    (prisma.referral.update as jest.Mock).mockResolvedValue({ id: "r1" });
    expect((await declineReferral("r1")).success).toBe(true);
    expect((prisma.referral.update as jest.Mock).mock.calls[0][0].data.status).toBe("declined");
  });

  it("reviveReferral: stale -> open", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue({ id: "r1", status: "stale" });
    (prisma.referral.update as jest.Mock).mockResolvedValue({ id: "r1" });
    expect((await reviveReferral("r1")).success).toBe(true);
    expect((prisma.referral.update as jest.Mock).mock.calls[0][0].data.status).toBe("open");
  });

  it("rejects when the referral is not owned/found", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue(null);
    expect((await engageReferral("missing")).message).toBe("crm.errors.referralNotFound");
  });
});

describe("commitReferralToApply (TipReifiesToJob)", () => {
  it("creates a Job in the resolved applied status and converts the referral", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue({ id: "r1", status: "in_review", targetCompanyId: "c1" });
    (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "c1", label: "Acme" });
    (resolveAppliedStatusId as jest.Mock).mockResolvedValue("applied-1");
    (prisma.jobTitle.upsert as jest.Mock).mockResolvedValue({ id: "jt1" });
    // Interactive ($transaction(cb)) form: provide a tx with the writers used.
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        job: { create: jest.fn().mockResolvedValue({ id: "job-1", Status: { value: "applied" } }) },
        jobStatusHistory: { create: jest.fn().mockResolvedValue({ id: "h1" }) },
        referral: { update: jest.fn().mockResolvedValue({ id: "r1" }) },
      }),
    );

    const res = await commitReferralToApply("r1");

    expect(res.success).toBe(true);
    expect((res as { success: true; data: { jobId: string } }).data.jobId).toBe("job-1");
    expect(resolveAppliedStatusId).toHaveBeenCalledWith("user-1");
    // Mirrors addJob: emits JobStatusChanged + writes the GDPR job.create audit.
    expect(jest.requireMock("@/lib/events").emitEvent).toHaveBeenCalledTimes(1);
    expect(jest.requireMock("@/lib/audit/data-audit").writeDataAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "job.create", targetId: "job-1" }),
    );
  });

  it("rejects when the referral is not in_review (illegal -> converted)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue({ id: "r1", status: "open", targetCompanyId: "c1" });
    const res = await commitReferralToApply("r1");
    expect(res.message).toBe("crm.errors.invalidTransition");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when there is no target company", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue({ id: "r1", status: "in_review", targetCompanyId: null });
    const res = await commitReferralToApply("r1");
    expect(res.message).toBe("crm.errors.referralRequiresTargetCompany");
  });
});

// Task 5.0 — read actions (gate the Phase-5 UI). SoT: surface ReferralWorkspace
// (exposes kind/tipster/target_company/target_job/status/dates) + @guarantee
// TipsterShownLive (tipster resolved LIVE from the Person, never snapshotted).
describe("getReferral", () => {
  it("rejects unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    expect((await getReferral("r1")).success).toBe(false);
  });

  it("returns an owned referral with the tipster resolved live (TipsterShownLive)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue({
      id: "r1",
      kind: "insider_relay",
      status: "open",
      tipster: { id: "p1", firstName: "Mara", lastName: "S", status: "active" },
      targetCompany: { id: "c1", label: "Acme" },
      targetJob: null,
    });

    const res = await getReferral("r1");

    expect(res.success).toBe(true);
    const call = (prisma.referral.findFirst as jest.Mock).mock.calls[0][0];
    // ADR-015: userId-scoped.
    expect(call.where).toEqual({ id: "r1", userId: "user-1" });
    // Live person resolution (a nested select on the Person), not a flat name string.
    expect(call.select.tipster).toBeTruthy();
    expect(call.select.tipster.select.status).toBe(true);
    expect(
      (res as { success: true; data: { tipster: { status: string } | null } }).data.tipster?.status,
    ).toBe("active");
  });

  it("returns referralNotFound when not owned / missing", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findFirst as jest.Mock).mockResolvedValue(null);
    expect((await getReferral("missing")).message).toBe("crm.errors.referralNotFound");
  });
});

describe("listReferrals", () => {
  it("rejects unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    expect((await listReferrals()).success).toBe(false);
  });

  it("returns the user's referrals newest-activity first", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findMany as jest.Mock).mockResolvedValue([{ id: "r1" }, { id: "r2" }]);

    const res = await listReferrals();

    expect(res.success).toBe(true);
    const call = (prisma.referral.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ userId: "user-1" });
    expect(call.orderBy).toEqual({ lastActivityAt: "desc" });
    expect((res as { success: true; data: unknown[] }).data).toHaveLength(2);
  });

  it("scopes by jobId via the targetJob relation (userId still enforced)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.referral.findMany as jest.Mock).mockResolvedValue([]);

    await listReferrals({ jobId: "job-9" });

    const call = (prisma.referral.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ userId: "user-1", targetJob: { id: "job-9" } });
  });
});
