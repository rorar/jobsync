/**
 * EURES Connector Tests
 *
 * Mocks the resilience module so no real HTTP calls are made.
 * BrokenCircuitError / BulkheadRejectedError / TaskCancelledError are re-exported
 * from cockatiel by the resilience wrapper, so we define lightweight stand-ins
 * inside the mock factory.
 */

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that reference them
// ---------------------------------------------------------------------------

jest.mock(
  "@/lib/connector/job-discovery/modules/eures/resilience",
  () => {
    class BrokenCircuitError extends Error {
      constructor() {
        super("circuit breaker open");
        this.name = "BrokenCircuitError";
      }
    }
    class BulkheadRejectedError extends Error {
      constructor() {
        super("bulkhead rejected");
        this.name = "BulkheadRejectedError";
      }
    }
    class TaskCancelledError extends Error {
      constructor() {
        super("task cancelled");
        this.name = "TaskCancelledError";
      }
    }
    class EuresApiError extends Error {
      constructor(
        public readonly status: number,
        message: string,
      ) {
        super(message);
        this.name = "EuresApiError";
      }
    }

    return {
      BrokenCircuitError,
      BulkheadRejectedError,
      TaskCancelledError,
      EuresApiError,
      resilientFetch: jest.fn(),
    };
  },
);

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createEuresConnector } from "@/lib/connector/job-discovery/modules/eures";
import { translateEuresVacancy } from "@/lib/connector/job-discovery/modules/eures/translator";
import * as resilienceModule from "@/lib/connector/job-discovery/modules/eures/resilience";

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockResilientFetch = resilienceModule.resilientFetch as jest.MockedFunction<
  typeof resilienceModule.resilientFetch
>;

const { BrokenCircuitError, BulkheadRejectedError, TaskCancelledError, EuresApiError } =
  resilienceModule as unknown as {
    BrokenCircuitError: new () => Error;
    BulkheadRejectedError: new () => Error;
    TaskCancelledError: new () => Error;
    EuresApiError: new (status: number, message: string) => Error & { status: number };
  };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal realistic EURES JobVacancy as returned by the search endpoint. */
function makeEuresJobVacancy(overrides: Record<string, unknown> = {}) {
  return {
    id: "jv-001",
    title: "Software Engineer",
    description: "<p>Build great things.</p>",
    creationDate: "2026-03-20T10:00:00Z",
    positionScheduleCodes: ["fulltime"],
    employer: { name: "Acme GmbH" },
    locationMap: { DE: ["Berlin"] },
    translations: {
      en: {
        title: "Software Engineer (EN)",
        description: "<p>Build great things (EN).</p>",
      },
    },
    ...overrides,
  };
}

/** Minimal EURES search response envelope. */
function makeSearchResponse(jvs: unknown[], numberRecords?: number) {
  return {
    jvs,
    numberRecords: numberRecords ?? jvs.length,
  };
}

/** Minimal EURES VacancyDetail as returned by the detail endpoint. */
function makeVacancyDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "jv-detail-001",
    creationDate: "2026-03-20T10:00:00Z",
    jvProfiles: {
      en: {
        title: "Senior Software Engineer",
        description: "<p>Full detail description.</p>",
        employer: { name: "Detail Corp" },
        locations: [{ cityName: "Munich", countryCode: "de" }],
        positionScheduleCodes: ["FullTime"],
        lastApplicationDate: "2026-04-30",
        applicationInstructions: ["Apply via portal"],
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createEuresConnector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a connector with id 'eures' and name 'EURES'", () => {
    const connector = createEuresConnector();
    expect(connector.id).toBe("eures");
    expect(connector.name).toBe("EURES");
    expect(connector.requiresApiKey).toBe(false);
  });

  it("exposes a search method and a getDetails method", () => {
    const connector = createEuresConnector();
    expect(typeof connector.search).toBe("function");
    expect(typeof connector.getDetails).toBe("function");
  });
});

describe("EuresConnector.search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const connector = createEuresConnector();
  const baseParams = { keywords: "developer", location: "de" };

  it("returns DiscoveredVacancy[] on a successful single-page response", async () => {
    const jv = makeEuresJobVacancy();
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse([jv]));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    const vacancy = result.data[0];
    expect(vacancy.externalId).toBe("jv-001");
    expect(vacancy.sourceBoard).toBe("eures");
    expect(vacancy.sourceUrl).toContain("jv-001");
  });

  it("returns an empty array when the response contains no vacancies", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse([]));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });

  it("paginates when numberRecords exceeds the first-page result count", async () => {
    const page1 = makeSearchResponse(
      [makeEuresJobVacancy({ id: "jv-p1" })],
      2, // total = 2, but first page only has 1
    );
    const page2 = makeSearchResponse([makeEuresJobVacancy({ id: "jv-p2" })], 2);

    mockResilientFetch
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(2);
    expect(mockResilientFetch).toHaveBeenCalledTimes(2);
  });

  it("stops pagination once all records are collected", async () => {
    const jvs = [
      makeEuresJobVacancy({ id: "jv-a" }),
      makeEuresJobVacancy({ id: "jv-b" }),
    ];
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse(jvs, 2));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    // Only one page fetch should have occurred
    expect(mockResilientFetch).toHaveBeenCalledTimes(1);
  });

  it("returns a network ConnectorError on generic fetch failure", async () => {
    mockResilientFetch.mockRejectedValueOnce(new Error("Network failure"));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain(
      "Network failure",
    );
  });

  it("returns a network ConnectorError on BrokenCircuitError", async () => {
    mockResilientFetch.mockRejectedValueOnce(new BrokenCircuitError());

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain(
      "circuit breaker",
    );
  });

  it("returns rate_limited ConnectorError on BulkheadRejectedError", async () => {
    mockResilientFetch.mockRejectedValueOnce(new BulkheadRejectedError());

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
  });

  it("returns a network ConnectorError on TaskCancelledError (timeout)", async () => {
    mockResilientFetch.mockRejectedValueOnce(new TaskCancelledError());

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("timed out");
  });

  it("returns rate_limited ConnectorError on EuresApiError with status 429", async () => {
    mockResilientFetch.mockRejectedValueOnce(new EuresApiError(429, "Too Many Requests"));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
    expect((result.error as { retryAfter?: number }).retryAfter).toBe(60);
  });

  it("returns a network ConnectorError on EuresApiError with non-429 status", async () => {
    mockResilientFetch.mockRejectedValueOnce(new EuresApiError(503, "Service Unavailable"));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("503");
  });

  it("passes language from connectorParams as requestLanguage", async () => {
    const jv = makeEuresJobVacancy({
      translations: { fr: { title: "Ingénieur logiciel (FR)", description: "desc" } },
    });
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse([jv]));

    const result = await connector.search({
      ...baseParams,
      connectorParams: { language: "fr" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // The translated title from the "fr" profile should be used
    expect(result.data[0].title).toBe("Ingénieur logiciel (FR)");
  });

  it("splits location string on commas into locationCodes", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse([]));

    await connector.search({ keywords: "dev", location: "de, fr, be" });

    const body = JSON.parse(
      (mockResilientFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.locationCodes).toEqual(["de", "fr", "be"]);
  });
});

describe("EuresConnector.getDetails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const connector = createEuresConnector();

  it("returns an enriched DiscoveredVacancy on success", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeVacancyDetail());

    const result = await connector.getDetails!("jv-detail-001");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.externalId).toBe("jv-detail-001");
    expect(result.data.title).toBe("Senior Software Engineer");
    expect(result.data.location).toBe("Munich, DE");
    expect(result.data.sourceBoard).toBe("eures");
    expect(result.data.applicationDeadline).toBe("2026-04-30");
    expect(result.data.employmentType).toBe("full_time");
  });

  it("returns a stub vacancy when jvProfiles is empty", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeVacancyDetail({ jvProfiles: {} }),
    );

    const result = await connector.getDetails!("jv-empty");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.title).toBe("");
    expect(result.data.location).toBe("Europe");
  });

  it("returns a network ConnectorError on BrokenCircuitError", async () => {
    mockResilientFetch.mockRejectedValueOnce(new BrokenCircuitError());

    const result = await connector.getDetails!("jv-detail-001");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
  });

  it("returns rate_limited ConnectorError on EuresApiError with status 429", async () => {
    mockResilientFetch.mockRejectedValueOnce(new EuresApiError(429, "Too Many Requests"));

    const result = await connector.getDetails!("jv-detail-001");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
    expect((result.error as { retryAfter?: number }).retryAfter).toBe(60);
  });

  it("returns a network ConnectorError on EuresApiError with non-429 status", async () => {
    mockResilientFetch.mockRejectedValueOnce(new EuresApiError(500, "Internal Server Error"));

    const result = await connector.getDetails!("jv-detail-001");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("500");
  });

  it("returns rate_limited ConnectorError on BulkheadRejectedError", async () => {
    mockResilientFetch.mockRejectedValueOnce(new BulkheadRejectedError());

    const result = await connector.getDetails!("jv-detail-001");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
  });

  it("returns a network ConnectorError on TaskCancelledError (timeout)", async () => {
    mockResilientFetch.mockRejectedValueOnce(new TaskCancelledError());

    const result = await connector.getDetails!("jv-detail-001");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("timed out");
  });

  it("passes requestLang from options to the detail API URL", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeVacancyDetail());

    await connector.getDetails!("jv-detail-001", { language: "de" });

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("requestLang=de"),
      expect.anything(),
    );
  });

  it("defaults requestLang to en when no options provided", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeVacancyDetail());

    await connector.getDetails!("jv-detail-001");

    expect(mockResilientFetch).toHaveBeenCalledWith(
      expect.stringContaining("requestLang=en"),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// translateEuresVacancy unit tests (translator.ts)
// ---------------------------------------------------------------------------

describe("translateEuresVacancy", () => {
  it("maps id, sourceBoard, and sourceUrl correctly", () => {
    const jv = makeEuresJobVacancy();
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");

    expect(vacancy.externalId).toBe("jv-001");
    expect(vacancy.sourceBoard).toBe("eures");
    expect(vacancy.sourceUrl).toBe(
      "https://europa.eu/eures/portal/jv-se/jv-details/jv-001",
    );
  });

  it("uses the translated title when the requested language translation exists", () => {
    const jv = makeEuresJobVacancy();
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.title).toBe("Software Engineer (EN)");
  });

  it("falls back to the top-level title when no translation is available", () => {
    const jv = makeEuresJobVacancy({ translations: {} });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "de");
    expect(vacancy.title).toBe("Software Engineer");
  });

  it("strips HTML from description", () => {
    const jv = makeEuresJobVacancy({
      translations: { en: { title: "Dev", description: "<p>Hello &amp; world</p>" } },
    });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.description).toBe("Hello & world");
  });

  it("maps 'fulltime' positionScheduleCode to 'full_time'", () => {
    const jv = makeEuresJobVacancy({ positionScheduleCodes: ["fulltime"] });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.employmentType).toBe("full_time");
  });

  it("maps 'parttime' positionScheduleCode to 'part_time'", () => {
    const jv = makeEuresJobVacancy({ positionScheduleCodes: ["parttime"] });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.employmentType).toBe("part_time");
  });

  it("maps 'flextime' positionScheduleCode to 'part_time'", () => {
    const jv = makeEuresJobVacancy({ positionScheduleCodes: ["flextime"] });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.employmentType).toBe("part_time");
  });

  it("returns undefined employmentType for unknown schedule codes", () => {
    const jv = makeEuresJobVacancy({ positionScheduleCodes: ["unknown_code"] });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.employmentType).toBeUndefined();
  });

  it("formats location as 'City, COUNTRY' when locationMap has a city", () => {
    const jv = makeEuresJobVacancy({ locationMap: { DE: ["Berlin"] } });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.location).toBe("Berlin, DE");
  });

  it("formats location as 'Europe' when locationMap is empty", () => {
    const jv = makeEuresJobVacancy({ locationMap: {} });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.location).toBe("Europe");
  });

  it("parses creationDate into a Date object", () => {
    const jv = makeEuresJobVacancy({ creationDate: "2026-03-20T10:00:00Z" });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.postedAt).toBeInstanceOf(Date);
    expect(vacancy.postedAt?.toISOString()).toBe("2026-03-20T10:00:00.000Z");
  });

  it("sets postedAt to undefined when creationDate is missing", () => {
    const jv = makeEuresJobVacancy({ creationDate: undefined });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.postedAt).toBeUndefined();
  });

  it("sets employerName from employer.name", () => {
    const jv = makeEuresJobVacancy({ employer: { name: "Big Corp" } });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.employerName).toBe("Big Corp");
  });

  it("sets employerName to empty string when employer is missing", () => {
    const jv = makeEuresJobVacancy({ employer: undefined });
    const vacancy = translateEuresVacancy(jv as unknown as Parameters<typeof translateEuresVacancy>[0], "en");
    expect(vacancy.employerName).toBe("");
  });
});
