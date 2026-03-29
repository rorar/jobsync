/**
 * JSearch Connector Tests
 *
 * Mocks the resilience module so no real HTTP calls are made.
 * JSearchApiError, BrokenCircuitError etc. are re-exported from the resilience
 * wrapper; lightweight stand-ins are defined inside the mock factory.
 */

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that reference them
// ---------------------------------------------------------------------------

jest.mock(
  "@/lib/connector/job-discovery/modules/jsearch/resilience",
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
    class JSearchApiError extends Error {
      constructor(
        public readonly status: number,
        message: string,
      ) {
        super(message);
        this.name = "JSearchApiError";
      }
    }

    return {
      BrokenCircuitError,
      BulkheadRejectedError,
      TaskCancelledError,
      JSearchApiError,
      resilientFetch: jest.fn(),
    };
  },
);

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { createJSearchConnector } from "@/lib/connector/job-discovery/modules/jsearch";
import * as resilienceModule from "@/lib/connector/job-discovery/modules/jsearch/resilience";

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockResilientFetch = resilienceModule.resilientFetch as jest.MockedFunction<
  typeof resilienceModule.resilientFetch
>;

const { BrokenCircuitError, BulkheadRejectedError, TaskCancelledError, JSearchApiError } =
  resilienceModule as unknown as {
    BrokenCircuitError: new () => Error;
    BulkheadRejectedError: new () => Error;
    TaskCancelledError: new () => Error;
    JSearchApiError: new (status: number, message: string) => Error & { status: number };
  };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface MockJSearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  employer_logo: string | null;
  job_publisher: string;
  job_employment_type: string;
  job_apply_link: string;
  job_description: string;
  job_is_remote: boolean;
  job_posted_at_datetime_utc: string;
  job_city: string;
  job_state: string;
  job_country: string;
  job_location: string;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_period: string | null;
}

function makeJSearchJob(overrides: Partial<MockJSearchJob> = {}): MockJSearchJob {
  return {
    job_id: "jsearch-job-001",
    job_title: "Frontend Developer",
    employer_name: "Tech Corp",
    employer_logo: null,
    job_publisher: "LinkedIn",
    job_employment_type: "FULLTIME",
    job_apply_link: "https://apply.example.com/job/001",
    job_description: "Build user interfaces using React and TypeScript.",
    job_is_remote: false,
    job_posted_at_datetime_utc: "2026-03-20T12:00:00Z",
    job_city: "New York",
    job_state: "NY",
    job_country: "US",
    job_location: "New York, NY, US",
    job_min_salary: null,
    job_max_salary: null,
    job_salary_period: null,
    ...overrides,
  };
}

function makeJSearchResponse(jobs: MockJSearchJob[], status = "OK") {
  return {
    status,
    request_id: "req-test-001",
    data: jobs,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createJSearchConnector", () => {
  it("returns a connector with id 'jsearch' and name 'JSearch'", () => {
    const connector = createJSearchConnector();
    expect(connector.id).toBe("jsearch");
    expect(connector.name).toBe("JSearch");
    expect(connector.requiresApiKey).toBe(true);
  });

  it("does not expose a getDetails method", () => {
    const connector = createJSearchConnector();
    expect(connector.getDetails).toBeUndefined();
  });
});

describe("JSearchConnector.search — credential handling", () => {
  it("returns a network error immediately when no credential is provided", async () => {
    const connector = createJSearchConnector(); // no credential

    const result = await connector.search({
      keywords: "developer",
      location: "Berlin",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain(
      "RAPIDAPI_KEY",
    );
    // resilientFetch should never be called when there is no credential
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("returns a network error when credential is an empty string", async () => {
    const connector = createJSearchConnector("");

    const result = await connector.search({
      keywords: "developer",
      location: "Berlin",
    });

    expect(result.success).toBe(false);
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });
});

describe("JSearchConnector.search — success path", () => {
  const CREDENTIAL = "test-rapidapi-key";
  const connector = createJSearchConnector(CREDENTIAL);
  const baseParams = { keywords: "developer", location: "Berlin" };

  it("returns DiscoveredVacancy[] on a successful response", async () => {
    const job = makeJSearchJob();
    mockResilientFetch.mockResolvedValueOnce(makeJSearchResponse([job]));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
  });

  it("maps JSearchJob fields to DiscoveredVacancy correctly", async () => {
    const job = makeJSearchJob({
      job_id: "jid-42",
      job_title: "Staff Engineer",
      employer_name: "MegaCorp",
      job_apply_link: "https://megacorp.io/apply",
      job_description: "Lead technical initiatives.",
      job_posted_at_datetime_utc: "2026-03-15T08:00:00Z",
      job_location: "San Francisco, CA, US",
      job_employment_type: "FULLTIME",
      job_min_salary: 150000,
      job_max_salary: 200000,
      job_salary_period: "year",
    });
    mockResilientFetch.mockResolvedValueOnce(makeJSearchResponse([job]));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const vacancy = result.data[0];
    expect(vacancy.externalId).toBe("jid-42");
    expect(vacancy.title).toBe("Staff Engineer");
    expect(vacancy.employerName).toBe("MegaCorp");
    expect(vacancy.sourceUrl).toBe("https://megacorp.io/apply");
    expect(vacancy.description).toBe("Lead technical initiatives.");
    expect(vacancy.sourceBoard).toBe("jsearch");
    expect(vacancy.location).toBe("San Francisco, CA, US");
    expect(vacancy.employmentType).toBe("full_time");
    expect(vacancy.postedAt).toEqual(new Date("2026-03-15T08:00:00Z"));
    expect(vacancy.salary).toContain("150");
    expect(vacancy.salary).toContain("200");
  });

  it("falls back to 'city, state' when job_location is empty", async () => {
    const job = makeJSearchJob({
      job_location: "",
      job_city: "Austin",
      job_state: "TX",
    });
    mockResilientFetch.mockResolvedValueOnce(makeJSearchResponse([job]));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].location).toBe("Austin, TX");
  });

  it("returns an empty array when data is empty", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeJSearchResponse([]));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([]);
  });

  it("calls resilientFetch with the credential as X-RapidAPI-Key header", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeJSearchResponse([]));

    await connector.search(baseParams);

    const [, init] = mockResilientFetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers["X-RapidAPI-Key"]).toBe(CREDENTIAL);
  });

  it("includes keywords and location in the query URL", async () => {
    mockResilientFetch.mockResolvedValueOnce(makeJSearchResponse([]));

    await connector.search({ keywords: "TypeScript", location: "Munich" });

    const [url] = mockResilientFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("TypeScript");
    expect(url).toContain("Munich");
  });
});

describe("JSearchConnector.search — error handling", () => {
  const CREDENTIAL = "test-rapidapi-key";
  const connector = createJSearchConnector(CREDENTIAL);
  const baseParams = { keywords: "developer", location: "Berlin" };

  it("returns rate_limited error on JSearchApiError with status 429", async () => {
    mockResilientFetch.mockRejectedValueOnce(
      new JSearchApiError(429, "Too Many Requests"),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
    expect((result.error as { retryAfter?: number }).retryAfter).toBe(60);
  });

  it("returns blocked error on JSearchApiError with status 403", async () => {
    mockResilientFetch.mockRejectedValueOnce(
      new JSearchApiError(403, "Forbidden"),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("blocked");
    expect((result.error as { reason: string }).reason).toContain("RapidAPI");
  });

  it("returns network error on JSearchApiError with other status (e.g. 500)", async () => {
    mockResilientFetch.mockRejectedValueOnce(
      new JSearchApiError(500, "Internal Server Error"),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("500");
  });

  it("returns network error on BrokenCircuitError", async () => {
    mockResilientFetch.mockRejectedValueOnce(new BrokenCircuitError());

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain(
      "circuit breaker",
    );
  });

  it("returns rate_limited error on BulkheadRejectedError", async () => {
    mockResilientFetch.mockRejectedValueOnce(new BulkheadRejectedError());

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("rate_limited");
  });

  it("returns network error on TaskCancelledError (timeout)", async () => {
    mockResilientFetch.mockRejectedValueOnce(new TaskCancelledError());

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toContain("timed out");
  });

  it("returns network error when resilientFetch throws a generic Error", async () => {
    mockResilientFetch.mockRejectedValueOnce(new Error("Failed to fetch"));

    const result = await connector.search(baseParams);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("network");
    expect((result.error as { message: string }).message).toBe("Failed to fetch");
  });
});

describe("JSearchConnector — employment type mapping", () => {
  const CREDENTIAL = "test-rapidapi-key";
  const connector = createJSearchConnector(CREDENTIAL);
  const baseParams = { keywords: "dev", location: "US" };

  const cases: Array<[string, "full_time" | "part_time" | "contract" | undefined]> = [
    ["FULLTIME", "full_time"],
    ["full_time", "full_time"],
    ["full-time", "full_time"],
    ["PARTTIME", "part_time"],
    ["part_time", "part_time"],
    ["part-time", "part_time"],
    ["CONTRACTOR", "contract"],
    ["contract", "contract"],
    ["INTERN", undefined],
    ["", undefined],
  ];

  it.each(cases)(
    "maps employment type '%s' to %s",
    async (rawType, expected) => {
      mockResilientFetch.mockResolvedValueOnce(
        makeJSearchResponse([makeJSearchJob({ job_employment_type: rawType })]),
      );

      const result = await connector.search(baseParams);

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data[0].employmentType).toBe(expected);
    },
  );
});

describe("formatSalary (via search result)", () => {
  const CREDENTIAL = "test-rapidapi-key";
  const connector = createJSearchConnector(CREDENTIAL);
  const baseParams = { keywords: "dev", location: "US" };

  it("returns undefined when both min and max salary are null", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeJSearchResponse([
        makeJSearchJob({ job_min_salary: null, job_max_salary: null }),
      ]),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].salary).toBeUndefined();
  });

  it("formats a salary range when both min and max are present", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeJSearchResponse([
        makeJSearchJob({
          job_min_salary: 80000,
          job_max_salary: 120000,
          job_salary_period: "year",
        }),
      ]),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const salary = result.data[0].salary!;
    expect(salary).toMatch(/80/);
    expect(salary).toMatch(/120/);
    expect(salary).toContain("year");
  });

  it("formats 'From $X per period' when only min salary is provided", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeJSearchResponse([
        makeJSearchJob({
          job_min_salary: 60000,
          job_max_salary: null,
          job_salary_period: "year",
        }),
      ]),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const salary = result.data[0].salary!;
    expect(salary).toMatch(/From \$60/);
    expect(salary).toContain("year");
  });

  it("formats 'Up to $X per period' when only max salary is provided", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeJSearchResponse([
        makeJSearchJob({
          job_min_salary: null,
          job_max_salary: 100000,
          job_salary_period: "month",
        }),
      ]),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    const salary = result.data[0].salary!;
    expect(salary).toMatch(/Up to \$100/);
    expect(salary).toContain("month");
  });

  it("defaults salary period to 'year' when job_salary_period is null", async () => {
    mockResilientFetch.mockResolvedValueOnce(
      makeJSearchResponse([
        makeJSearchJob({
          job_min_salary: 50000,
          job_max_salary: 70000,
          job_salary_period: null,
        }),
      ]),
    );

    const result = await connector.search(baseParams);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].salary).toContain("year");
  });
});
