/**
 * personConnection.actions.spec.ts — Welle 5 (Inside Track) Phase 3, Task 3.2
 *
 * Directed person-to-person network edges. SoT: specs/inside-track.allium
 * rule AddPersonConnection (from != to, no duplicate, < max_connections_per_user)
 * + invariants NoSelfConnection / DistinctEndpointsPerUser.
 */
import {
  addPersonConnection,
  removePersonConnection,
  listPersonConnections,
} from "@/actions/personConnection.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

jest.mock("@prisma/client", () => {
  const m = {
    person: { count: jest.fn() },
    personConnection: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => m) };
});
jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));

const prisma = new PrismaClient();
const user = { id: "user-1", name: "U", email: "u@x.io" };
beforeEach(() => jest.clearAllMocks());

function bothPersonsOwned() {
  (prisma.person.count as jest.Mock).mockResolvedValue(2);
}

describe("addPersonConnection", () => {
  it("rejects unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    expect((await addPersonConnection({ fromPersonId: "a", toPersonId: "b", kind: "friend", strength: "close" })).success).toBe(false);
  });

  it("rejects self-connection (NoSelfConnection)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    const res = await addPersonConnection({ fromPersonId: "a", toPersonId: "a", kind: "friend", strength: "close" });
    expect(res.message).toBe("crm.errors.connectionSelf");
    expect(prisma.personConnection.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid kind/strength (ADR-019)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    const res = await addPersonConnection({ fromPersonId: "a", toPersonId: "b", kind: "buddy", strength: "close" });
    expect(res.success).toBe(false);
    expect(prisma.personConnection.create).not.toHaveBeenCalled();
  });

  it("rejects when a person is not owned (IDOR)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.person.count as jest.Mock).mockResolvedValue(1); // only one endpoint owned
    const res = await addPersonConnection({ fromPersonId: "a", toPersonId: "b", kind: "friend", strength: "close" });
    expect(res.message).toBe("crm.errors.personNotFound");
  });

  it("rejects a duplicate edge (DistinctEndpointsPerUser)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    bothPersonsOwned();
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue({ id: "existing" });
    const res = await addPersonConnection({ fromPersonId: "a", toPersonId: "b", kind: "friend", strength: "close" });
    expect(res.message).toBe("crm.errors.connectionExists");
    expect(prisma.personConnection.create).not.toHaveBeenCalled();
  });

  it("rejects when the per-user cap is reached", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    bothPersonsOwned();
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.personConnection.count as jest.Mock).mockResolvedValue(10000);
    const res = await addPersonConnection({ fromPersonId: "a", toPersonId: "b", kind: "friend", strength: "close" });
    expect(res.message).toBe("crm.errors.connectionLimitReached");
    expect(prisma.personConnection.create).not.toHaveBeenCalled();
  });

  it("creates a valid edge", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    bothPersonsOwned();
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.personConnection.count as jest.Mock).mockResolvedValue(3);
    (prisma.personConnection.create as jest.Mock).mockResolvedValue({ id: "pc1" });
    const res = await addPersonConnection({ fromPersonId: "a", toPersonId: "b", kind: "former_colleague", strength: "medium", notes: "ex-team" });
    expect(res.success).toBe(true);
    expect(prisma.personConnection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", fromPersonId: "a", toPersonId: "b", kind: "former_colleague", strength: "medium" }),
      }),
    );
  });
});

describe("removePersonConnection", () => {
  it("rejects when not found (IDOR)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue(null);
    expect((await removePersonConnection("x")).message).toBe("crm.errors.connectionNotFound");
  });
  it("deletes an owned edge", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.personConnection.findFirst as jest.Mock).mockResolvedValue({ id: "pc1" });
    (prisma.personConnection.delete as jest.Mock).mockResolvedValue({ id: "pc1" });
    expect((await removePersonConnection("pc1")).success).toBe(true);
  });
});

describe("listPersonConnections", () => {
  it("lists the user's edges (userId-scoped)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    (prisma.personConnection.findMany as jest.Mock).mockResolvedValue([{ id: "pc1" }]);
    const res = await listPersonConnections();
    expect(res.success).toBe(true);
    expect((prisma.personConnection.findMany as jest.Mock).mock.calls[0][0].where).toMatchObject({ userId: "user-1" });
  });
});
