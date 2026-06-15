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
} from "@/actions/referral.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";
import { resolveAppliedStatusId } from "@/lib/crm/resolve-applied-status";

jest.mock("@prisma/client", () => {
  const m = {
    referral: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
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
    (prisma.$transaction as jest.Mock).mockResolvedValue([{ id: "job-1" }, { id: "r1" }]);

    const res = await commitReferralToApply("r1");

    expect(res.success).toBe(true);
    expect((res as { success: true; data: { jobId: string } }).data.jobId).toBe("job-1");
    expect(resolveAppliedStatusId).toHaveBeenCalledWith("user-1");
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
