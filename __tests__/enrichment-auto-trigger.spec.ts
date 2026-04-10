import { eventBus } from "@/lib/events/event-bus";
import { createEvent } from "@/lib/events/event-types";
import {
  _testHelpers,
  registerEnrichmentTrigger,
} from "@/lib/events/consumers/enrichment-trigger";
import {
  enrichmentOrchestrator,
  getChainForDimension,
} from "@/lib/connector/data-enrichment/orchestrator";
import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    job: {
      findFirst: jest.fn(),
    },
    enrichmentResult: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    company: {
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/connector/data-enrichment/orchestrator", () => ({
  enrichmentOrchestrator: {
    execute: jest.fn(),
  },
  getChainForDimension: jest.fn(),
}));

const mockDb = db as unknown as {
  job: { findFirst: jest.Mock };
  enrichmentResult: { findFirst: jest.Mock; updateMany: jest.Mock };
  company: { updateMany: jest.Mock };
};

const mockOrchestrator = enrichmentOrchestrator as unknown as {
  execute: jest.Mock;
};

const mockGetChain = getChainForDimension as jest.Mock;

const { handleCompanyCreated, handleVacancyPromoted, extractDomainFromCompanyName } =
  _testHelpers;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const logoChain = {
  dimension: "logo" as const,
  entries: [{ moduleId: "logo_dev", priority: 1 }],
};

const deepLinkChain = {
  dimension: "deep_link" as const,
  entries: [{ moduleId: "meta_parser", priority: 1 }],
};

/** Wait for fire-and-forget promises in the microtask queue */
async function flushPromises(): Promise<void> {
  await new Promise((r) => setTimeout(r, 10));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractDomainFromCompanyName", () => {
  it("converts company name to domain", () => {
    expect(extractDomainFromCompanyName("Acme")).toBe("acme.com");
  });

  it("strips legal suffix Corp before converting", () => {
    expect(extractDomainFromCompanyName("Acme Corp")).toBe("acme.com");
  });

  it("strips legal suffix GmbH before converting", () => {
    expect(extractDomainFromCompanyName("Siemens GmbH")).toBe("siemens.com");
  });

  it("strips legal suffix Inc. before converting", () => {
    expect(extractDomainFromCompanyName("GitHub, Inc.")).toBe("github.com");
  });

  it("strips legal suffix AG before converting", () => {
    expect(extractDomainFromCompanyName("SAP AG")).toBe("sap.com");
  });

  it("preserves input that already looks like a domain", () => {
    expect(extractDomainFromCompanyName("acme.com")).toBe("acme.com");
    expect(extractDomainFromCompanyName("Acme.DE")).toBe("acme.de");
  });

  it("returns null for empty string", () => {
    expect(extractDomainFromCompanyName("")).toBeNull();
  });

  it("returns null for very short name", () => {
    expect(extractDomainFromCompanyName("A")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(extractDomainFromCompanyName("   ")).toBeNull();
  });

  it("returns null for name that reduces to single char after cleaning", () => {
    expect(extractDomainFromCompanyName("- -")).toBeNull();
  });

  it("returns null for name that is only a legal suffix", () => {
    expect(extractDomainFromCompanyName("GmbH")).toBeNull();
  });
});

describe("EnrichmentTrigger — CompanyCreated", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.enrichmentResult.updateMany.mockResolvedValue({ count: 1 });
    mockDb.company.updateMany.mockResolvedValue({ count: 1 });
  });

  it("triggers logo enrichment on CompanyCreated", async () => {
    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockResolvedValue({
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://example.com/logo.png" },
      source: "logo_dev",
      ttl: 86400,
    });

    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });

    await handleCompanyCreated(event);
    await flushPromises();

    expect(mockGetChain).toHaveBeenCalledWith("logo");
    expect(mockOrchestrator.execute).toHaveBeenCalledWith(
      "user-1",
      {
        dimension: "logo",
        companyDomain: "acme.com",
        companyName: "Acme Corp",
      },
      logoChain,
    );
  });

  it("links enrichment result to company on success", async () => {
    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockResolvedValue({
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://example.com/logo.png" },
      source: "logo_dev",
      ttl: 86400,
    });

    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });

    await handleCompanyCreated(event);
    await flushPromises();

    // Verify enrichment result was linked to the company
    expect(mockDb.enrichmentResult.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        dimension: "logo",
        domainKey: "acme.com",
        companyId: null,
      },
      data: { companyId: "company-1" },
    });
  });

  it("writes back logoUrl to company on success", async () => {
    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockResolvedValue({
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://example.com/logo.png" },
      source: "logo_dev",
      ttl: 86400,
    });

    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });

    await handleCompanyCreated(event);
    await flushPromises();

    expect(mockDb.company.updateMany).toHaveBeenCalledWith({
      where: {
        id: "company-1",
        createdBy: "user-1",
        logoUrl: null,
      },
      data: { logoUrl: "https://example.com/logo.png" },
    });
  });

  it("skips enrichment when domain cannot be extracted", async () => {
    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "",
      userId: "user-1",
    });

    await handleCompanyCreated(event);
    await flushPromises();

    expect(mockOrchestrator.execute).not.toHaveBeenCalled();
  });

  it("skips enrichment when no chain is configured", async () => {
    mockGetChain.mockReturnValue(undefined);

    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });

    await handleCompanyCreated(event);
    await flushPromises();

    expect(mockOrchestrator.execute).not.toHaveBeenCalled();
  });

  it("swallows orchestrator errors silently", async () => {
    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockRejectedValue(new Error("API failure"));

    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });

    // Should not throw
    await handleCompanyCreated(event);
    await flushPromises();

    expect(mockOrchestrator.execute).toHaveBeenCalled();
  });

  it("does not write back logoUrl when enrichment returns not_found", async () => {
    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockResolvedValue({
      dimension: "logo",
      status: "not_found",
      data: {},
      source: "logo_dev",
      ttl: 300,
    });

    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });

    await handleCompanyCreated(event);
    await flushPromises();

    expect(mockDb.company.updateMany).not.toHaveBeenCalled();
  });

  it("does not write back when orchestrator returns null", async () => {
    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockResolvedValue(null);

    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });

    await handleCompanyCreated(event);
    await flushPromises();

    expect(mockDb.company.updateMany).not.toHaveBeenCalled();
    expect(mockDb.enrichmentResult.updateMany).not.toHaveBeenCalled();
  });
});

describe("EnrichmentTrigger — VacancyPromoted", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.enrichmentResult.updateMany.mockResolvedValue({ count: 1 });
    mockDb.company.updateMany.mockResolvedValue({ count: 1 });
  });

  it("triggers logo + deep_link enrichment on VacancyPromoted", async () => {
    mockDb.job.findFirst.mockResolvedValue({
      companyId: "company-1",
      jobUrl: "https://example.com/job/123",
      Company: { id: "company-1", label: "Acme Corp" },
    });

    mockGetChain.mockImplementation((dim: string) => {
      if (dim === "logo") return logoChain;
      if (dim === "deep_link") return deepLinkChain;
      return undefined;
    });

    mockOrchestrator.execute.mockResolvedValue({
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://example.com/logo.png" },
      source: "logo_dev",
      ttl: 86400,
    });

    const event = createEvent("VacancyPromoted", {
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });

    await handleVacancyPromoted(event);
    await flushPromises();

    // Verify job was looked up with IDOR (userId in where)
    expect(mockDb.job.findFirst).toHaveBeenCalledWith({
      where: { id: "job-1", userId: "user-1" },
      select: {
        companyId: true,
        jobUrl: true,
        Company: { select: { id: true, label: true } },
      },
    });

    // Both logo and deep_link chains should be requested
    expect(mockGetChain).toHaveBeenCalledWith("logo");
    expect(mockGetChain).toHaveBeenCalledWith("deep_link");

    // Orchestrator called for both dimensions
    expect(mockOrchestrator.execute).toHaveBeenCalledTimes(2);
    expect(mockOrchestrator.execute).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ dimension: "logo", companyDomain: "acme.com" }),
      logoChain,
    );
    expect(mockOrchestrator.execute).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ dimension: "deep_link", url: "https://example.com/job/123" }),
      deepLinkChain,
    );
  });

  it("skips logo enrichment when job has no company", async () => {
    mockDb.job.findFirst.mockResolvedValue({
      companyId: null,
      jobUrl: "https://example.com/job/123",
      Company: null,
    });

    mockGetChain.mockReturnValue(deepLinkChain);
    mockOrchestrator.execute.mockResolvedValue(null);

    const event = createEvent("VacancyPromoted", {
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });

    await handleVacancyPromoted(event);
    await flushPromises();

    // Only deep_link chain should be requested, not logo
    expect(mockGetChain).not.toHaveBeenCalledWith("logo");
    expect(mockGetChain).toHaveBeenCalledWith("deep_link");
  });

  it("skips deep_link enrichment when job has no URL", async () => {
    mockDb.job.findFirst.mockResolvedValue({
      companyId: "company-1",
      jobUrl: null,
      Company: { id: "company-1", label: "Acme Corp" },
    });

    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockResolvedValue(null);

    const event = createEvent("VacancyPromoted", {
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });

    await handleVacancyPromoted(event);
    await flushPromises();

    // Only logo chain should be requested, not deep_link
    expect(mockGetChain).toHaveBeenCalledWith("logo");
    expect(mockGetChain).not.toHaveBeenCalledWith("deep_link");
  });

  it("does nothing when job is not found (IDOR guard)", async () => {
    mockDb.job.findFirst.mockResolvedValue(null);

    const event = createEvent("VacancyPromoted", {
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });

    await handleVacancyPromoted(event);
    await flushPromises();

    expect(mockOrchestrator.execute).not.toHaveBeenCalled();
  });

  it("does nothing when DB lookup fails", async () => {
    mockDb.job.findFirst.mockRejectedValue(new Error("DB error"));

    const event = createEvent("VacancyPromoted", {
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });

    // Should not throw
    await handleVacancyPromoted(event);
    await flushPromises();

    expect(mockOrchestrator.execute).not.toHaveBeenCalled();
  });

  it("swallows orchestrator errors for both dimensions", async () => {
    mockDb.job.findFirst.mockResolvedValue({
      companyId: "company-1",
      jobUrl: "https://example.com/job/123",
      Company: { id: "company-1", label: "Acme Corp" },
    });

    mockGetChain.mockImplementation((dim: string) => {
      if (dim === "logo") return logoChain;
      if (dim === "deep_link") return deepLinkChain;
      return undefined;
    });

    mockOrchestrator.execute.mockRejectedValue(new Error("API failure"));

    const event = createEvent("VacancyPromoted", {
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });

    // Should not throw
    await handleVacancyPromoted(event);
    await flushPromises();

    expect(mockOrchestrator.execute).toHaveBeenCalledTimes(2);
  });

  it("links enrichment result and writes logo on VacancyPromoted success", async () => {
    mockDb.job.findFirst.mockResolvedValue({
      companyId: "company-1",
      jobUrl: null,
      Company: { id: "company-1", label: "Acme Corp" },
    });

    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockResolvedValue({
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://example.com/logo.png" },
      source: "logo_dev",
      ttl: 86400,
    });

    const event = createEvent("VacancyPromoted", {
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });

    await handleVacancyPromoted(event);
    await flushPromises();

    expect(mockDb.enrichmentResult.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        dimension: "logo",
        domainKey: "acme.com",
        companyId: null,
      },
      data: { companyId: "company-1" },
    });

    expect(mockDb.company.updateMany).toHaveBeenCalledWith({
      where: {
        id: "company-1",
        createdBy: "user-1",
        logoUrl: null,
      },
      data: { logoUrl: "https://example.com/logo.png" },
    });
  });
});

describe("EnrichmentTrigger — Registration", () => {
  beforeEach(() => {
    eventBus.reset();
  });

  it("registers handlers for CompanyCreated and VacancyPromoted", () => {
    registerEnrichmentTrigger();

    expect(eventBus.handlerCount("CompanyCreated")).toBe(1);
    expect(eventBus.handlerCount("VacancyPromoted")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Sprint 3 M-A-06 — Non-blocking handler contract
//
// The EnrichmentTrigger handlers used to `await db.enrichmentResult.findFirst`
// BEFORE scheduling the fire-and-forget orchestrator call. Because the event
// bus awaits every handler (even in parallel allSettled dispatch — each
// allSettled promise still resolves on the handler's returned promise),
// that pre-flight DB call stalled the publish() return on 1-3 DB round-trips
// per event. The fix moves the DB lookups inside the fire-and-forget closure
// so the handler returns synchronously and the event bus unblocks immediately.
//
// The orchestrator's internal cache-before-chain lookup
// (`buildEnrichmentCacheKey + findFirst` inside `execute()`) still prevents
// duplicate work for the same (userId, dimension, domainKey) — so dropping
// the pre-flight does not relax the dedup guarantee.
//
// Finding: stream-5b-architecture.md M-A-06.
// ---------------------------------------------------------------------------
describe("M-A-06 — non-blocking handler contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.enrichmentResult.updateMany.mockResolvedValue({ count: 1 });
    mockDb.company.updateMany.mockResolvedValue({ count: 1 });
  });

  it("handleCompanyCreated does not block publish() on a pre-flight DB read", async () => {
    // The orchestrator is made deliberately slow (100ms) so that a regression
    // which awaits it — or awaits a pre-flight DB call — would push the
    // handler resolution past the immediate microtask checkpoint.
    let executeResolved = false;
    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            executeResolved = true;
            resolve({
              dimension: "logo",
              status: "found",
              data: { logoUrl: "https://example.com/logo.png" },
              source: "logo_dev",
              ttl: 86400,
            });
          }, 100);
        }),
    );

    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });

    // The handler returns (nearly) synchronously even though the orchestrator
    // hasn't resolved yet. We measure by awaiting ONE microtask tick — if the
    // handler blocked on the orchestrator, `executeResolved` would be true
    // only after 100ms.
    await handleCompanyCreated(event);
    // A single microtask tick is enough to drain the synchronous `void (async () => ...)()`
    // scheduling but NOT the orchestrator's 100ms delay.
    await Promise.resolve();
    expect(executeResolved).toBe(false);

    // Drain the delayed orchestrator so jest does not complain about open
    // handles, and confirm it eventually runs.
    await new Promise((r) => setTimeout(r, 150));
    expect(executeResolved).toBe(true);
  });

  it("handleCompanyCreated does not call the pre-flight enrichmentResult.findFirst", async () => {
    // The pre-flight DB read was removed — the orchestrator handles the
    // cache-before-chain. Assert that no `findFirst` is invoked from the
    // handler's synchronous path.
    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockResolvedValue({
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://example.com/logo.png" },
      source: "logo_dev",
      ttl: 86400,
    });

    const findFirstMock = jest.fn();
    // Patch the mock module to observe any findFirst calls.
    mockDb.enrichmentResult.findFirst = findFirstMock;

    const event = createEvent("CompanyCreated", {
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });

    await handleCompanyCreated(event);
    await flushPromises();

    expect(findFirstMock).not.toHaveBeenCalled();
    expect(mockOrchestrator.execute).toHaveBeenCalled();
  });

  it("handleVacancyPromoted does not block publish() on job lookup", async () => {
    // The job.findFirst is a required lookup but should run inside the
    // fire-and-forget closure, not in the synchronous handler body.
    let jobLookupResolved = false;
    mockDb.job.findFirst.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            jobLookupResolved = true;
            resolve({
              companyId: "company-1",
              jobUrl: null,
              Company: { id: "company-1", label: "Acme Corp" },
            });
          }, 100);
        }),
    );
    mockGetChain.mockReturnValue(logoChain);
    mockOrchestrator.execute.mockResolvedValue(null);

    const event = createEvent("VacancyPromoted", {
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });

    await handleVacancyPromoted(event);
    // Only one microtask tick — not enough for the 100ms delayed findFirst.
    await Promise.resolve();
    expect(jobLookupResolved).toBe(false);

    // Drain for cleanup.
    await new Promise((r) => setTimeout(r, 150));
    expect(jobLookupResolved).toBe(true);
  });
});
