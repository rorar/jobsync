/**
 * warmPath.actions.spec.ts — Welle 5 (Inside Track) Phase 4, Tasks 4.1 + 4.2
 *
 * findWarmPaths: 1-hop insiders (CompanyAssociation at the company, incl. former)
 * + 2-hop network paths (PersonConnection to an insider), ranked, with every
 * surfaced Person consent-checked. SoT: specs/inside-track.allium surface
 * WarmPathFinder (@guarantee ExcludesConsentBlockedPersons).
 */
import { findWarmPaths } from "@/actions/warmPath.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

jest.mock("@prisma/client", () => {
  const m = {
    person: { findMany: jest.fn() },
    personConnection: { findMany: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));

const prisma = new PrismaClient();
const user = { id: "user-1", name: "U", email: "u@x.io" };
const TARGET = "company-acme";

const consenting = { processingBasis: "legitimate_interest", consentWithdrawnAt: null };
const blocked = { processingBasis: "consent", consentWithdrawnAt: new Date() };

function person(id: string, companies: unknown[], extra: object = {}) {
  return {
    id,
    firstName: id,
    lastName: null,
    companies: JSON.stringify(companies),
    ...consenting,
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUser as jest.Mock).mockResolvedValue(user);
  (prisma.personConnection.findMany as jest.Mock).mockResolvedValue([]);
});

describe("findWarmPaths — 1-hop insiders", () => {
  it("finds contacts with a CompanyAssociation at the target (active + former)", async () => {
    (prisma.person.findMany as jest.Mock).mockResolvedValue([
      person("active-insider", [{ companyId: TARGET, companyLabel: "Acme", isPrimary: true, endDate: null }]),
      person("former-insider", [{ companyId: TARGET, companyLabel: "Acme", isPrimary: false, endDate: "2023-01-01" }]),
      person("unrelated", [{ companyId: "other", companyLabel: "Other", isPrimary: true }]),
    ]);

    const res = await findWarmPaths(TARGET);
    expect(res.success).toBe(true);
    const data = (res as { success: true; data: { insiders: { personId: string; isFormer: boolean }[] } }).data;
    const ids = data.insiders.map((i) => i.personId);
    expect(ids).toContain("active-insider");
    expect(ids).toContain("former-insider");
    expect(ids).not.toContain("unrelated");
  });

  it("ranks active associations before former ones", async () => {
    (prisma.person.findMany as jest.Mock).mockResolvedValue([
      person("former", [{ companyId: TARGET, companyLabel: "Acme", isPrimary: false, endDate: "2022-01-01" }]),
      person("active", [{ companyId: TARGET, companyLabel: "Acme", isPrimary: true, endDate: null }]),
    ]);
    const res = await findWarmPaths(TARGET);
    const data = (res as { success: true; data: { insiders: { personId: string }[] } }).data;
    expect(data.insiders[0].personId).toBe("active");
    expect(data.insiders[1].personId).toBe("former");
  });

  it("excludes a consent-blocked insider (@guarantee ExcludesConsentBlockedPersons)", async () => {
    (prisma.person.findMany as jest.Mock).mockResolvedValue([
      person("ok", [{ companyId: TARGET, companyLabel: "Acme", endDate: null }]),
      person("withdrew", [{ companyId: TARGET, companyLabel: "Acme", endDate: null }], blocked),
    ]);
    const res = await findWarmPaths(TARGET);
    const data = (res as { success: true; data: { insiders: { personId: string }[] } }).data;
    expect(data.insiders.map((i) => i.personId)).toEqual(["ok"]);
  });
});

describe("findWarmPaths — 2-hop network paths", () => {
  it("finds a contact who knows an insider via PersonConnection", async () => {
    (prisma.person.findMany as jest.Mock).mockResolvedValue([
      person("insider", [{ companyId: TARGET, companyLabel: "Acme", endDate: null }]),
    ]);
    (prisma.personConnection.findMany as jest.Mock).mockResolvedValue([
      {
        id: "pc1",
        kind: "former_colleague",
        strength: "close",
        fromPersonId: "intro",
        toPersonId: "insider",
        fromPerson: { id: "intro", firstName: "Intro", lastName: null, ...consenting },
        toPerson: { id: "insider", firstName: "insider", lastName: null, ...consenting },
      },
    ]);

    const res = await findWarmPaths(TARGET);
    const data = (res as { success: true; data: { networkPaths: { intermediaryId: string; insiderId: string }[] } }).data;
    expect(data.networkPaths).toHaveLength(1);
    expect(data.networkPaths[0]).toMatchObject({ intermediaryId: "intro", insiderId: "insider" });
    // 2-hop query is scoped to insider ids + userId
    expect((prisma.personConnection.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({
      userId: "user-1",
      toPersonId: { in: ["insider"] },
    });
  });

  it("excludes a 2-hop path whose intermediary is consent-blocked", async () => {
    (prisma.person.findMany as jest.Mock).mockResolvedValue([
      person("insider", [{ companyId: TARGET, companyLabel: "Acme", endDate: null }]),
    ]);
    (prisma.personConnection.findMany as jest.Mock).mockResolvedValue([
      {
        id: "pc1",
        kind: "friend",
        strength: "close",
        fromPersonId: "blocked-intro",
        toPersonId: "insider",
        fromPerson: { id: "blocked-intro", firstName: "B", lastName: null, ...blocked },
        toPerson: { id: "insider", firstName: "insider", lastName: null, ...consenting },
      },
    ]);
    const res = await findWarmPaths(TARGET);
    const data = (res as { success: true; data: { networkPaths: unknown[] } }).data;
    expect(data.networkPaths).toHaveLength(0);
  });
});

describe("findWarmPaths — guards", () => {
  it("rejects unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    expect((await findWarmPaths(TARGET)).success).toBe(false);
  });

  it("returns empty structure when no insiders exist (no 2-hop query)", async () => {
    (prisma.person.findMany as jest.Mock).mockResolvedValue([]);
    const res = await findWarmPaths(TARGET);
    const data = (res as { success: true; data: { insiders: unknown[]; networkPaths: unknown[] } }).data;
    expect(data.insiders).toEqual([]);
    expect(data.networkPaths).toEqual([]);
    expect(prisma.personConnection.findMany).not.toHaveBeenCalled();
  });
});
