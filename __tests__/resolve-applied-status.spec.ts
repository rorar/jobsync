/**
 * resolve-applied-status.spec.ts — Welle 5 (Inside Track) Phase 3, Task 3.3
 *
 * resolveAppliedStatusId implements the TipReifiesToJob FALLBACK CONTRACT
 * (inside-track.allium @guidance, verified against jobStatus delete-guard):
 *   applied-kind status -> user default (isDefault) -> any status. Never null
 *   (>=1 status always exists per the delete-guard).
 */

import { resolveAppliedStatusId } from "@/lib/crm/resolve-applied-status";
import { PrismaClient } from "@prisma/client";

jest.mock("@prisma/client", () => {
  const m = { jobStatus: { findFirst: jest.fn() } };
  return { PrismaClient: jest.fn(() => m) };
});

const prisma = new PrismaClient();
const USER = "user-1";

beforeEach(() => jest.clearAllMocks());

describe("resolveAppliedStatusId", () => {
  it("prefers a status whose category kind is 'applied'", async () => {
    (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValueOnce({ id: "applied-status" });

    const id = await resolveAppliedStatusId(USER);

    expect(id).toBe("applied-status");
    // First query is the applied-kind lookup, userId-scoped (ADR-015).
    const firstCall = (prisma.jobStatus.findFirst as jest.Mock).mock.calls[0][0];
    expect(firstCall.where).toMatchObject({ userId: USER, category: { kind: "applied" } });
  });

  it("falls back to the user's default status when no applied-kind status exists", async () => {
    (prisma.jobStatus.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // no applied-kind
      .mockResolvedValueOnce({ id: "default-status" }); // isDefault

    const id = await resolveAppliedStatusId(USER);

    expect(id).toBe("default-status");
    expect((prisma.jobStatus.findFirst as jest.Mock).mock.calls[1][0].where).toMatchObject({
      userId: USER,
      isDefault: true,
    });
  });

  it("falls back to any status when neither applied-kind nor default exists", async () => {
    (prisma.jobStatus.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // no applied-kind
      .mockResolvedValueOnce(null) // no default
      .mockResolvedValueOnce({ id: "any-status" });

    const id = await resolveAppliedStatusId(USER);

    expect(id).toBe("any-status");
  });

  it("throws only in the impossible case of zero statuses (delete-guard guarantees >=1)", async () => {
    (prisma.jobStatus.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveAppliedStatusId(USER)).rejects.toThrow();
  });
});
