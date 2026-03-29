/**
 * Arbeitsagentur Connector Tests
 *
 * Mocks the resilience module so no real HTTP calls are made.
 * ArbeitsagenturApiError is re-exported from the resilience wrapper; we define
 * a compatible stand-in inside the mock factory.
 */

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that reference them
// ---------------------------------------------------------------------------

jest.mock(
  "@/lib/connector/job-discovery/modules/arbeitsagentur/resilience",
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
    class ArbeitsagenturApiError extends Error {
      constructor(
        public readonly status: number,
        message: string,
      ) {
        super(message);
        this.name = "ArbeitsagenturApiError";
      }
    }

    return {
      BrokenCircuitError,
      BulkheadRejectedError,
      TaskCancelledError,
      ArbeitsagenturApiError,
      resilientFetch: jest.fn(),
    };
  },
);

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createArbeitsagenturConnector } from "@/lib/connector/job-discovery/modules/arbeitsagentur";
import * as resilienceModule from "@/lib/connector/job-discovery/modules/arbeitsagentur/resilience";

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockResilientFetch = resilienceModule.resilientFetch as jest.MockedFunction<
  typeof resilienceModule.resilientFetch
>;

const { BrokenCircuitError, BulkheadRejectedError, TaskCancelledError, ArbeitsagenturApiError } =
  resilienceModule as unknown as {
    BrokenCircuitError: new () => Error;
    BulkheadRejectedError: new () => Error;
    TaskCancelledError: new () => Error;
    ArbeitsagenturApiError: new (status: number, message: string) => Error & { status: number };
  };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeArbeitsagenturJob(overrides: Record<string, unknown> = {}) {
  return {
    refnr: "12345-6789",
    hashId: "abc123hash",
    titel: "Softwareentwickler (m/w/d)",
    arbeitgeber: "Muster GmbH",
    arbeitsort: {
      ort: "Berlin",
      region: "Berlin",
      plz: "10115",
      land: "Deutschland",
    },
    arbeitszeit: "vz",
    befristung: 2,
    aktuelleVeroeffentlichungsdatum: "2026-03-20T08:00:00Z",
    beruf: "Softwareentwickler",
    ...overrides,
  };
}

function makeSearchResponse(
  jobs: unknown[],
  maxErgebnisse?: number,
  page = 0,
  size = 50,
) {
  return {
    stellenangebote: jobs,
    maxErgebnisse: maxErgebnisse ?? jobs.length,
    page,
    size,
  };
}

function makeJobDetail(overrides: Record<string, unknown> = {}) {
  return {
    refnr: "12345-6789",
    hashId: "abc123hash",
    titel: "Softwareentwickler (m/w/d)",
    arbeitgeber: "Muster GmbH",
    arbeitsort: {
      ort: "Berlin",
      region: "Berlin",
    },
    arbeitszeit: "vz",
    aktuelleVeroeffentlichungsdatum: "2026-03-20T08:00:00Z",
    stellenbeschreibung: "<p>Wir suchen <b>erfahrene</b> Entwickler &amp; Architekten.</p>",
    beruf: "Softwareentwickler",
    verguetung: "60.000 – 80.000 EUR/Jahr",
    bewerbung: "<p>Bitte per E-Mail bewerben.</p>",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createArbeitsagenturConnector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a connector with id 'arbeitsagentur' and name 'Arbeitsagentur'", () => {
    const connector = createArbeitsagenturConnector();
    expect(connector.id).toBe("arbeitsagentur");
    expect(connector.name).toBe("Arbeitsagentur");
    expect(connector.requiresApiKey).toBe(false);
  });

  it("exposes search and getDetails methods", () => {
    const connector = createArbeitsagenturConnector();
    expect(typeof connector.search).toBe("function");
    expect(typeof connector.getDetails).toBe("function");
  });
});

describe("ArbeitsagenturConnector.search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const connector = createArbeitsagenturConnector();
  const baseParams = { keywords: "Softwareentwickler", location: "Berlin" };

  it("returns DiscoveredVacancy[] on a successful single-page response", async () => {
    const job = makeArbeitsagenturJob();
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse([job]));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    const vacancy = result.data[0];
    expect(vacancy.externalId).toBe("12345-6789");
    expect(vacancy.title).toBe("Softwareentwickler (m/w/d)");
    expect(vacancy.employerName).toBe("Muster GmbH");
    expect(vacancy.sourceBoard).toBe("arbeitsagentur");
    expect(vacancy.employmentType).toBe("full_time");
  });

  it("returns an empty array when stellenangebote is empty", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse([]));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
    expect(mockResilientFetch).toHaveBeenCalledTimes(1);
  });

  it("includes umkreis connector param in the request URL", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse([]));

    await connector.search({
      ...baseParams,
      connectorParams: { umkreis: 50 },
    });

    const calledUrl = mockResilientFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("umkreis=50");
  });

  it("includes arbeitszeit connector param in the request URL", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse([]));

    await connector.search({
      ...baseParams,
      connectorParams: { arbeitszeit: "tz" },
    });

    const calledUrl = mockResilientFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("arbeitszeit=tz");
  });

  it("stops pagination once maxErgebnisse is reached", async () => {
    const page0Jobs = Array.from({ length: 2 }, (_, i) =>
      makeArbeitsagenturJob({ refnr: `ref-p0-${i}` }),
    );
    // maxErgebnisse = 2, so only one page should be fetched
    mockResilientFetch.mockResolvedValueOnce(makeSearchResponse(page0Jobs, 2));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    expect(mockResilientFetch).toHaveBeenCalledTimes(1);
    if (!result.success) return;
    expect(result.data).toHaveLength(2);
  });

  it("paginates when first page has fewer results than maxErgebnisse and a full page", async () => {
    const page0Jobs = Array.from({ length: 50 }, (_, i) =>
      makeArbeitsagenturJob({ refnr: `ref-p0-${i}` }),
    );
    const page1Jobs = [makeArbeitsagenturJob({ refnr: "ref-p1-0" })];

    // total = 51 (page0 has 50 full rows, so pagination continues)
    mockResilientFetch
      .mockResolvedValueOnce(makeSearchResponse(page0Jobs, 51))
      .mockResolvedValueOnce(makeSearchResponse(page1Jobs, 51));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    expect(mockResilientFetch).toHaveBeenCalledTimes(2);
    if (!result.success) return;
    expect(result.data).toHaveLength(51);
  });

  it("returns a rate_limited error on ArbeitsagenturApiError with status 429", async () => {
    mockResilientFetch.mockRejectedValueOnce(
      new ArbeitsagenturApiError(429, "Too Many Requests"),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
    expect((result.error as { retryAfter?: number }).retryAfter).toBe(60);
  });

  it("returns a network error on ArbeitsagenturApiError with non-429 status", async () => {
    mockResilientFetch.mockRejectedValueOnce(
      new ArbeitsagenturApiError(503, "Service Unavailable"),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("503");
  });

  it("returns a network error on BrokenCircuitError", async () => {
    mockResilientFetch.mockRejectedValueOnce(new BrokenCircuitError());

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
  });

  it("returns rate_limited error on BulkheadRejectedError", async () => {
    mockResilientFetch.mockRejectedValueOnce(new BulkheadRejectedError());

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
  });

  it("returns a network error on TaskCancelledError (timeout)", async () => {
    mockResilientFetch.mockRejectedValueOnce(new TaskCancelledError());

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("timed out");
  });

  it("returns a network error on generic Error", async () => {
    mockResilientFetch.mockRejectedValueOnce(new Error("connection refused"));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toBe(
      "connection refused",
    );
  });

  it("maps 'vz' arbeitszeit to 'full_time'", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeSearchResponse([makeArbeitsagenturJob({ arbeitszeit: "vz" })]),
    );
    const result = await connector.search(baseParams);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].employmentType).toBe("full_time");
  });

  it("maps 'tz' arbeitszeit to 'part_time'", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeSearchResponse([makeArbeitsagenturJob({ arbeitszeit: "tz" })]),
    );
    const result = await connector.search(baseParams);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].employmentType).toBe("part_time");
  });

  it("builds location as 'city, region' when both differ", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeSearchResponse([
        makeArbeitsagenturJob({
          arbeitsort: { ort: "Nuremberg", region: "Bavaria" },
        }),
      ]),
    );
    const result = await connector.search(baseParams);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].location).toBe("Nuremberg, Bavaria");
  });

  it("builds location as just city when ort equals region", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeSearchResponse([
        makeArbeitsagenturJob({
          arbeitsort: { ort: "Berlin", region: "Berlin" },
        }),
      ]),
    );
    const result = await connector.search(baseParams);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].location).toBe("Berlin");
  });

  it("falls back to 'Deutschland' when arbeitsort has no ort or region", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeSearchResponse([makeArbeitsagenturJob({ arbeitsort: {} })]),
    );
    const result = await connector.search(baseParams);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].location).toBe("Deutschland");
  });

  it("builds sourceUrl with hashId when present", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeSearchResponse([makeArbeitsagenturJob({ hashId: "myhash" })]),
    );
    const result = await connector.search(baseParams);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].sourceUrl).toContain("id=myhash");
  });

  it("builds sourceUrl from refnr when hashId is absent", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeSearchResponse([makeArbeitsagenturJob({ hashId: undefined })]),
    );
    const result = await connector.search(baseParams);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].sourceUrl).toContain("was=");
  });

  it("stops pagination at MAX_PAGES (20) even if more results exist", async () => {
    // Simulate an API that always returns a full page of 50, with a huge total
    const fullPage = Array.from({ length: 50 }, (_, i) =>
      makeArbeitsagenturJob({ refnr: `ref-inf-${i}` }),
    );
    // 20 pages of 50 = 1000 results, but total claims 5000
    for (let p = 0; p < 20; p++) {
      mockResilientFetch.mockResolvedValueOnce(makeSearchResponse(fullPage, 5000));
    }

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    // Should have fetched exactly 20 pages (page indices 0..19)
    expect(mockResilientFetch).toHaveBeenCalledTimes(20);
    if (!result.success) return;
    expect(result.data).toHaveLength(1000);
  });
});

describe("ArbeitsagenturConnector.getDetails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const connector = createArbeitsagenturConnector();

  it("returns an enriched DiscoveredVacancy with full description", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeJobDetail());

    const result = await connector.getDetails!("12345-6789");

    expect(result.success).toBe(true);
    if (!result.success) return;
    const vacancy = result.data;
    expect(vacancy.externalId).toBe("12345-6789");
    expect(vacancy.title).toBe("Softwareentwickler (m/w/d)");
    expect(vacancy.sourceBoard).toBe("arbeitsagentur");
    // HTML-stripped description
    expect(vacancy.description).not.toContain("<p>");
    expect(vacancy.description).toContain("erfahrene");
    expect(vacancy.description).toContain("&"); // &amp; decoded
    expect(vacancy.salary).toBe("60.000 – 80.000 EUR/Jahr");
    expect(vacancy.applicationInstructions).toBe("Bitte per E-Mail bewerben.");
  });

  it("falls back to beruf when stellenbeschreibung is absent", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeJobDetail({ stellenbeschreibung: undefined }),
    );

    const result = await connector.getDetails!("12345-6789");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.description).toBe("Softwareentwickler");
  });

  it("returns empty description when both stellenbeschreibung and beruf are absent", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeJobDetail({ stellenbeschreibung: undefined, beruf: undefined }),
    );

    const result = await connector.getDetails!("12345-6789");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.description).toBe("");
  });

  it("returns rate_limited error on ArbeitsagenturApiError 429", async () => {
    mockResilientFetch.mockRejectedValueOnce(
      new ArbeitsagenturApiError(429, "Too Many Requests"),
    );

    const result = await connector.getDetails!("12345-6789");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
  });

  it("returns network error on ArbeitsagenturApiError 404", async () => {
    mockResilientFetch.mockRejectedValueOnce(
      new ArbeitsagenturApiError(404, "Not Found"),
    );

    const result = await connector.getDetails!("unknown-refnr");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("404");
  });

  it("returns network error on generic failure", async () => {
    mockResilientFetch.mockRejectedValueOnce(new Error("timeout"));

    const result = await connector.getDetails!("12345-6789");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toBe("timeout");
  });

  it("returns rate_limited error on BulkheadRejectedError", async () => {
    mockResilientFetch.mockRejectedValueOnce(new BulkheadRejectedError());

    const result = await connector.getDetails!("12345-6789");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
  });

  it("returns a network error on TaskCancelledError (timeout)", async () => {
    mockResilientFetch.mockRejectedValueOnce(new TaskCancelledError());

    const result = await connector.getDetails!("12345-6789");

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("timed out");
  });

  it("sets salary to undefined when verguetung is absent", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeJobDetail({ verguetung: undefined }),
    );

    const result = await connector.getDetails!("12345-6789");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.salary).toBeUndefined();
  });

  it("sets applicationInstructions to undefined when bewerbung is absent", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeJobDetail({ bewerbung: undefined }),
    );

    const result = await connector.getDetails!("12345-6789");

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.applicationInstructions).toBeUndefined();
  });
});
