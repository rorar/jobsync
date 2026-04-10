/**
 * LogoAssetSubscriber Tests
 *
 * Tests: event handling for EnrichmentCompleted events (logo dimension),
 * domain base extraction, duplicate download guards, company resolution.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// Mocks — declared before imports (Jest hoisting)
// ---------------------------------------------------------------------------

const mockEnrichmentResultFindUnique = jest.fn();
const mockCompanyFindFirst = jest.fn();
const mockLogoAssetFindUnique = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    enrichmentResult: {
      findUnique: (...args: unknown[]) => mockEnrichmentResultFindUnique(...args),
    },
    company: {
      findFirst: (...args: unknown[]) => mockCompanyFindFirst(...args),
    },
    logoAsset: {
      findUnique: (...args: unknown[]) => mockLogoAssetFindUnique(...args),
    },
  },
}));

const mockDownloadAndProcess = jest.fn();

jest.mock("@/lib/assets/logo-asset-service", () => ({
  logoAssetService: {
    downloadAndProcess: (...args: unknown[]) => mockDownloadAndProcess(...args),
  },
}));

// L-S-06: mock validateWebhookUrl to test SSRF re-validation at subscriber boundary
const mockValidateWebhookUrl = jest.fn();
jest.mock("@/lib/url-validation", () => ({
  validateWebhookUrl: (...args: unknown[]) => mockValidateWebhookUrl(...args),
}));

// Use a real EventBus instance for integration-style testing
const mockSubscribe = jest.fn();

jest.mock("@/lib/events/event-bus", () => ({
  eventBus: {
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { registerLogoAssetSubscriber } from "@/lib/assets/logo-asset-subscriber";
import { DomainEventType, createEvent } from "@/lib/events/event-types";
import type { DomainEvent, EnrichmentCompletedPayload } from "@/lib/events/event-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const userId = "test-user-id";
const companyId = "company-fixture-id";
const domainKey = "acme.com";
const logoUrl = "https://img.logo.dev/acme.com?format=png";

/** Wait for fire-and-forget promises in the microtask queue */
async function flushPromises(): Promise<void> {
  await new Promise((r) => setTimeout(r, 10));
}

/**
 * Get the handler registered by registerLogoAssetSubscriber.
 * Calls registerLogoAssetSubscriber and extracts the handler from mockSubscribe.
 */
function getRegisteredHandler(): (
  event: DomainEvent<typeof DomainEventType.EnrichmentCompleted>,
) => Promise<void> {
  registerLogoAssetSubscriber();
  expect(mockSubscribe).toHaveBeenCalledWith(
    DomainEventType.EnrichmentCompleted,
    expect.any(Function),
  );
  return mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1][1];
}

function createEnrichmentEvent(
  overrides: Partial<EnrichmentCompletedPayload> = {},
): DomainEvent<typeof DomainEventType.EnrichmentCompleted> {
  return createEvent(DomainEventType.EnrichmentCompleted, {
    requestId: "request-1",
    dimension: "logo",
    moduleId: "logo_dev",
    userId,
    domainKey,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LogoAssetSubscriber", () => {
  let handler: (
    event: DomainEvent<typeof DomainEventType.EnrichmentCompleted>,
  ) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = getRegisteredHandler();

    // Default: enrichment result found with logoUrl
    mockEnrichmentResultFindUnique.mockResolvedValue({
      companyId,
      data: JSON.stringify({ logoUrl }),
      status: "found",
    });

    // No existing logo asset by default
    mockLogoAssetFindUnique.mockResolvedValue(null);

    // downloadAndProcess resolves successfully
    mockDownloadAndProcess.mockResolvedValue(undefined);

    // L-S-06: default validateWebhookUrl returns valid
    mockValidateWebhookUrl.mockReturnValue({ valid: true });
  });

  it("triggers download for logo dimension enrichment completed", async () => {
    const event = createEnrichmentEvent();
    await handler(event);
    await flushPromises();

    // Should query the enrichment result
    expect(mockEnrichmentResultFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_dimension_domainKey: {
            userId,
            dimension: "logo",
            domainKey,
          },
        },
      }),
    );

    // Should fire download
    expect(mockDownloadAndProcess).toHaveBeenCalledWith(logoUrl, userId, companyId);
  });

  it("ignores non-logo dimensions", async () => {
    const event = createEnrichmentEvent({ dimension: "deep_link" });
    await handler(event);

    // Should not even query enrichment result
    expect(mockEnrichmentResultFindUnique).not.toHaveBeenCalled();
    expect(mockDownloadAndProcess).not.toHaveBeenCalled();
  });

  it("skips when enrichment result status is not found", async () => {
    mockEnrichmentResultFindUnique.mockResolvedValue({
      companyId,
      data: JSON.stringify({ logoUrl }),
      status: "not_found",
    });

    const event = createEnrichmentEvent();
    await handler(event);

    expect(mockDownloadAndProcess).not.toHaveBeenCalled();
  });

  it("skips when no logoUrl in enrichment data", async () => {
    mockEnrichmentResultFindUnique.mockResolvedValue({
      companyId,
      data: JSON.stringify({}),
      status: "found",
    });

    const event = createEnrichmentEvent();
    await handler(event);

    expect(mockDownloadAndProcess).not.toHaveBeenCalled();
  });

  it("skips when companyId cannot be resolved", async () => {
    // No companyId in enrichment result, and company lookup fails
    mockEnrichmentResultFindUnique.mockResolvedValue({
      companyId: null,
      data: JSON.stringify({ logoUrl }),
      status: "found",
    });
    mockCompanyFindFirst.mockResolvedValue(null);

    const event = createEnrichmentEvent();
    await handler(event);

    expect(mockDownloadAndProcess).not.toHaveBeenCalled();
  });

  it("skips duplicate download when pending asset exists", async () => {
    mockLogoAssetFindUnique.mockResolvedValue({
      status: "pending",
      sourceUrl: logoUrl,
    });

    const event = createEnrichmentEvent();
    await handler(event);

    expect(mockDownloadAndProcess).not.toHaveBeenCalled();
  });

  it("skips when existing ready asset has same URL", async () => {
    mockLogoAssetFindUnique.mockResolvedValue({
      status: "ready",
      sourceUrl: logoUrl,
    });

    const event = createEnrichmentEvent();
    await handler(event);

    expect(mockDownloadAndProcess).not.toHaveBeenCalled();
  });

  it("re-downloads when existing asset has different URL", async () => {
    mockLogoAssetFindUnique.mockResolvedValue({
      status: "ready",
      sourceUrl: "https://old-logo.example.com/logo.png",
    });

    const event = createEnrichmentEvent();
    await handler(event);
    await flushPromises();

    expect(mockDownloadAndProcess).toHaveBeenCalledWith(logoUrl, userId, companyId);
  });

  // -------------------------------------------------------------------------
  // L-S-06: SSRF re-validation at subscriber boundary (defense-in-depth)
  // -------------------------------------------------------------------------

  describe("L-S-06: SSRF re-validation before download", () => {
    it("calls validateWebhookUrl on the logoUrl before triggering download", async () => {
      const event = createEnrichmentEvent();
      await handler(event);
      await flushPromises();

      expect(mockValidateWebhookUrl).toHaveBeenCalledWith(logoUrl);
      expect(mockDownloadAndProcess).toHaveBeenCalledWith(logoUrl, userId, companyId);
    });

    it("drops download and does NOT call downloadAndProcess when SSRF re-validation fails", async () => {
      // Simulate DB row mutated to a private IP after enrichment wrote it
      const mutatedLogoUrl = "http://10.0.0.1/private-logo.png";
      mockEnrichmentResultFindUnique.mockResolvedValue({
        companyId,
        data: JSON.stringify({ logoUrl: mutatedLogoUrl }),
        status: "found",
      });
      mockValidateWebhookUrl.mockReturnValue({
        valid: false,
        error: "webhook.ssrfBlocked",
      });

      const event = createEnrichmentEvent();
      await handler(event);
      await flushPromises();

      expect(mockDownloadAndProcess).not.toHaveBeenCalled();
    });

    it("emits console.warn when logoUrl is dropped by SSRF re-validation", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const mutatedLogoUrl = "http://169.254.169.254/meta-data";
      mockEnrichmentResultFindUnique.mockResolvedValue({
        companyId,
        data: JSON.stringify({ logoUrl: mutatedLogoUrl }),
        status: "found",
      });
      mockValidateWebhookUrl.mockReturnValue({
        valid: false,
        error: "webhook.ssrfBlocked",
      });

      const event = createEnrichmentEvent();
      await handler(event);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("SSRF re-validation"),
      );
      warnSpy.mockRestore();
    });

    it("proceeds with download when SSRF re-validation passes for safe URL", async () => {
      mockValidateWebhookUrl.mockReturnValue({ valid: true });

      const event = createEnrichmentEvent();
      await handler(event);
      await flushPromises();

      expect(mockDownloadAndProcess).toHaveBeenCalledWith(logoUrl, userId, companyId);
    });
  });

  it("uses startsWith instead of contains for company lookup", async () => {
    // No companyId in enrichment result — forces fallback company lookup
    mockEnrichmentResultFindUnique.mockResolvedValue({
      companyId: null,
      data: JSON.stringify({ logoUrl }),
      status: "found",
    });
    mockCompanyFindFirst.mockResolvedValue({ id: companyId });

    const event = createEnrichmentEvent();
    await handler(event);

    // Verify the company findFirst query uses startsWith
    expect(mockCompanyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          value: { startsWith: "acme" },
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// extractDomainBase (unit tests via integration — handler indirectly calls it)
// ---------------------------------------------------------------------------

describe("extractDomainBase (via company lookup)", () => {
  let handler: (
    event: DomainEvent<typeof DomainEventType.EnrichmentCompleted>,
  ) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = getRegisteredHandler();

    mockLogoAssetFindUnique.mockResolvedValue(null);
    mockDownloadAndProcess.mockResolvedValue(undefined);
  });

  /**
   * Helper: test that a given domainKey results in a startsWith query
   * with the expected base string.
   */
  async function expectDomainBase(
    testDomainKey: string,
    expectedBase: string,
  ): Promise<void> {
    mockEnrichmentResultFindUnique.mockResolvedValue({
      companyId: null,
      data: JSON.stringify({ logoUrl }),
      status: "found",
    });
    mockCompanyFindFirst.mockResolvedValue({ id: companyId });

    const event = createEnrichmentEvent({ domainKey: testDomainKey });
    await handler(event);

    expect(mockCompanyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          value: { startsWith: expectedBase },
        }),
      }),
    );
  }

  it("strips all TLDs correctly: acme.com -> acme", async () => {
    await expectDomainBase("acme.com", "acme");
  });

  it("strips all TLDs correctly: acme.co.uk -> acme", async () => {
    jest.clearAllMocks();
    handler = getRegisteredHandler();
    mockLogoAssetFindUnique.mockResolvedValue(null);
    mockDownloadAndProcess.mockResolvedValue(undefined);
    await expectDomainBase("acme.co.uk", "acme");
  });

  it("strips all TLDs correctly: acme.de -> acme", async () => {
    jest.clearAllMocks();
    handler = getRegisteredHandler();
    mockLogoAssetFindUnique.mockResolvedValue(null);
    mockDownloadAndProcess.mockResolvedValue(undefined);
    await expectDomainBase("acme.de", "acme");
  });
});
