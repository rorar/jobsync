/**
 * Company repository (server-only leaf) tests — D5 bounded-context fix.
 *
 * `setCompanyDomainIfUnset` is the named Company-aggregate write the enrichment
 * event consumer routes through instead of a raw `db.company.updateMany`.
 * Pins: owner-scoped where-clause (createdBy, ADR-015), domain-only-if-unset,
 * and best-effort non-throwing behaviour.
 */

import { setCompanyDomainIfUnset } from "@/lib/company-repository";
import db from "@/lib/db";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    company: { updateMany: jest.fn() },
  },
}));

const mockUpdateMany = (db as unknown as {
  company: { updateMany: jest.Mock };
}).company.updateMany;

describe("setCompanyDomainIfUnset (D5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("writes the domain scoped by owner + only when currently unset", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const written = await setCompanyDomainIfUnset("company-1", "user-1", "acme.com");

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "company-1", createdBy: "user-1", domain: null },
      data: { domain: "acme.com" },
    });
    expect(written).toBe(1);
  });

  it("returns 0 when no row matched (domain already set or wrong owner)", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    expect(await setCompanyDomainIfUnset("company-1", "user-1", "acme.com")).toBe(0);
  });

  it("is best-effort: swallows DB errors and returns 0 (never throws)", async () => {
    mockUpdateMany.mockRejectedValue(new Error("db down"));

    await expect(
      setCompanyDomainIfUnset("company-1", "user-1", "acme.com"),
    ).resolves.toBe(0);
  });
});
