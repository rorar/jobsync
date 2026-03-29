/**
 * Tests for EURES connector reading configurable params from connectorParams.
 *
 * These tests focus specifically on the new manifest-driven params introduced
 * in the AutomationWizard feature: all 9 configurable EURES API fields must
 * be read from connectorParams with sensible defaults, replacing the old
 * hardcoded LAST_WEEK value.
 *
 * This file complements connector-eures.spec.ts which covers the general
 * search/getDetails/translator behaviour.
 */

// ---------------------------------------------------------------------------
// Module mocks — must be declared before imports
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
import * as resilienceModule from "@/lib/connector/job-discovery/modules/eures/resilience";
import type { SearchParams } from "@/lib/connector/job-discovery/types";

// ---------------------------------------------------------------------------
// Typed mock helpers
// ---------------------------------------------------------------------------

const mockResilientFetch = resilienceModule.resilientFetch as jest.MockedFunction<
  typeof resilienceModule.resilientFetch
>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSearchResponse(jvs: unknown[] = [], numberRecords?: number) {
  return {
    jvs,
    numberRecords: numberRecords ?? jvs.length,
  };
}

/** Extract the parsed JSON body from the first resilientFetch call. */
function getRequestBody(): Record<string, unknown> {
  const rawBody = (mockResilientFetch.mock.calls[0][1] as RequestInit).body as string;
  return JSON.parse(rawBody);
}

const connector = createEuresConnector();

const baseParams: SearchParams = {
  keywords: "developer",
  location: "de",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EURES connector — connectorParams reading", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: empty one-page response so the connector completes the while loop
    mockResilientFetch.mockResolvedValue(makeSearchResponse([]));
  });

  // ── publicationPeriod ─────────────────────────────────────────────────────

  describe("publicationPeriod", () => {
    it("defaults to LAST_WEEK when not provided in connectorParams", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().publicationPeriod).toBe("LAST_WEEK");
    });

    it("uses LAST_DAY when set in connectorParams", async () => {
      await connector.search({ ...baseParams, connectorParams: { publicationPeriod: "LAST_DAY" } });
      expect(getRequestBody().publicationPeriod).toBe("LAST_DAY");
    });

    it("uses LAST_THREE_DAYS when set in connectorParams", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { publicationPeriod: "LAST_THREE_DAYS" },
      });
      expect(getRequestBody().publicationPeriod).toBe("LAST_THREE_DAYS");
    });

    it("uses LAST_MONTH when set in connectorParams", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { publicationPeriod: "LAST_MONTH" },
      });
      expect(getRequestBody().publicationPeriod).toBe("LAST_MONTH");
    });

    it("uses LAST_WEEK when connectorParams is an empty object", async () => {
      await connector.search({ ...baseParams, connectorParams: {} });
      expect(getRequestBody().publicationPeriod).toBe("LAST_WEEK");
    });
  });

  // ── sortSearch ────────────────────────────────────────────────────────────

  describe("sortSearch", () => {
    it("defaults to MOST_RECENT when not provided", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().sortSearch).toBe("MOST_RECENT");
    });

    it("uses BEST_MATCH when set in connectorParams", async () => {
      await connector.search({ ...baseParams, connectorParams: { sortSearch: "BEST_MATCH" } });
      expect(getRequestBody().sortSearch).toBe("BEST_MATCH");
    });
  });

  // ── requiredExperienceCodes ───────────────────────────────────────────────

  describe("requiredExperienceCodes", () => {
    it("defaults to an empty array when not provided", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().requiredExperienceCodes).toEqual([]);
    });

    it("passes the provided experience codes array to the API", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { requiredExperienceCodes: ["none_required", "up_to_1_year"] },
      });
      expect(getRequestBody().requiredExperienceCodes).toEqual(["none_required", "up_to_1_year"]);
    });

    it("passes a single-element array correctly", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { requiredExperienceCodes: ["more_than_5_years"] },
      });
      expect(getRequestBody().requiredExperienceCodes).toEqual(["more_than_5_years"]);
    });
  });

  // ── positionOfferingCodes ─────────────────────────────────────────────────

  describe("positionOfferingCodes", () => {
    it("defaults to an empty array when not provided", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().positionOfferingCodes).toEqual([]);
    });

    it("passes the provided offering codes to the API", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { positionOfferingCodes: ["contract", "internship"] },
      });
      expect(getRequestBody().positionOfferingCodes).toEqual(["contract", "internship"]);
    });
  });

  // ── positionScheduleCodes ─────────────────────────────────────────────────

  describe("positionScheduleCodes", () => {
    it("defaults to an empty array when not provided", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().positionScheduleCodes).toEqual([]);
    });

    it("passes the provided schedule codes to the API", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { positionScheduleCodes: ["fulltime", "parttime"] },
      });
      expect(getRequestBody().positionScheduleCodes).toEqual(["fulltime", "parttime"]);
    });
  });

  // ── educationLevelCodes ───────────────────────────────────────────────────

  describe("educationLevelCodes", () => {
    it("defaults to an empty array when not provided", async () => {
      await connector.search(baseParams);
      // educationLevelCodes maps to educationAndQualificationLevelCodes in the API body
      expect(getRequestBody().educationAndQualificationLevelCodes).toEqual([]);
    });

    it("passes education level codes to the API under the correct key", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { educationLevelCodes: ["bachelor", "master"] },
      });
      expect(getRequestBody().educationAndQualificationLevelCodes).toEqual(["bachelor", "master"]);
    });
  });

  // ── sectorCodes ───────────────────────────────────────────────────────────

  describe("sectorCodes", () => {
    it("defaults to an empty array when not provided", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().sectorCodes).toEqual([]);
    });

    it("passes sector codes to the API", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { sectorCodes: ["a", "j", "m"] },
      });
      expect(getRequestBody().sectorCodes).toEqual(["a", "j", "m"]);
    });
  });

  // ── euresFlagCodes ────────────────────────────────────────────────────────

  describe("euresFlagCodes", () => {
    it("defaults to an empty array when not provided", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().euresFlagCodes).toEqual([]);
    });

    it("passes WITH flag code to the API", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { euresFlagCodes: ["WITH"] },
      });
      expect(getRequestBody().euresFlagCodes).toEqual(["WITH"]);
    });

    it("passes WITHOUT flag code to the API", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { euresFlagCodes: ["WITHOUT"] },
      });
      expect(getRequestBody().euresFlagCodes).toEqual(["WITHOUT"]);
    });
  });

  // ── requiredLanguages ─────────────────────────────────────────────────────

  describe("requiredLanguages", () => {
    it("defaults to an empty array when not provided", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().requiredLanguages).toEqual([]);
    });

    it("defaults to empty array when requiredLanguages is an empty string", async () => {
      await connector.search({ ...baseParams, connectorParams: { requiredLanguages: "" } });
      expect(getRequestBody().requiredLanguages).toEqual([]);
    });

    it("splits a comma-separated language string into an array", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { requiredLanguages: "de(B2), en(C1)" },
      });
      expect(getRequestBody().requiredLanguages).toEqual(["de(B2)", "en(C1)"]);
    });

    it("handles a single language without a comma", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { requiredLanguages: "fr(A2)" },
      });
      expect(getRequestBody().requiredLanguages).toEqual(["fr(A2)"]);
    });

    it("trims whitespace from each language token", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: { requiredLanguages: "de(B2) ,  en(C1) , fr(A2)" },
      });
      expect(getRequestBody().requiredLanguages).toEqual(["de(B2)", "en(C1)", "fr(A2)"]);
    });
  });

  // ── Combined params ───────────────────────────────────────────────────────

  describe("all params combined", () => {
    it("passes all 9 configurable params simultaneously to the API", async () => {
      await connector.search({
        ...baseParams,
        connectorParams: {
          publicationPeriod: "LAST_MONTH",
          sortSearch: "BEST_MATCH",
          requiredExperienceCodes: ["more_than_5_years"],
          positionOfferingCodes: ["directhire"],
          positionScheduleCodes: ["fulltime"],
          educationLevelCodes: ["master"],
          sectorCodes: ["j"],
          euresFlagCodes: ["WITH"],
          requiredLanguages: "en(C1)",
        },
      });

      const body = getRequestBody();
      expect(body.publicationPeriod).toBe("LAST_MONTH");
      expect(body.sortSearch).toBe("BEST_MATCH");
      expect(body.requiredExperienceCodes).toEqual(["more_than_5_years"]);
      expect(body.positionOfferingCodes).toEqual(["directhire"]);
      expect(body.positionScheduleCodes).toEqual(["fulltime"]);
      expect(body.educationAndQualificationLevelCodes).toEqual(["master"]);
      expect(body.sectorCodes).toEqual(["j"]);
      expect(body.euresFlagCodes).toEqual(["WITH"]);
      expect(body.requiredLanguages).toEqual(["en(C1)"]);
    });

    it("defaults all array params to empty arrays when connectorParams is null", async () => {
      await connector.search({ ...baseParams, connectorParams: undefined });

      const body = getRequestBody();
      expect(body.requiredExperienceCodes).toEqual([]);
      expect(body.positionOfferingCodes).toEqual([]);
      expect(body.positionScheduleCodes).toEqual([]);
      expect(body.educationAndQualificationLevelCodes).toEqual([]);
      expect(body.sectorCodes).toEqual([]);
      expect(body.euresFlagCodes).toEqual([]);
      expect(body.requiredLanguages).toEqual([]);
    });
  });

  // ── Fixed / structural params ─────────────────────────────────────────────

  describe("structural (non-configurable) request params", () => {
    it("always sends resultsPerPage=50", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().resultsPerPage).toBe(50);
    });

    it("always starts at page=1", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().page).toBe(1);
    });

    it("always sends occupationUris as empty array", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().occupationUris).toEqual([]);
    });

    it("always sends skillUris as empty array", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().skillUris).toEqual([]);
    });

    it("always sends otherBenefitsCodes as empty array", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().otherBenefitsCodes).toEqual([]);
    });

    it("sessionId starts with 'jobsync-'", async () => {
      await connector.search(baseParams);
      expect((getRequestBody().sessionId as string).startsWith("jobsync-")).toBe(true);
    });
  });

  // ── Language / requestLanguage ────────────────────────────────────────────

  describe("requestLanguage from connectorParams.language", () => {
    it("defaults requestLanguage to 'en' when no language in connectorParams", async () => {
      await connector.search(baseParams);
      expect(getRequestBody().requestLanguage).toBe("en");
    });

    it("uses the provided language as requestLanguage", async () => {
      await connector.search({ ...baseParams, connectorParams: { language: "de" } });
      expect(getRequestBody().requestLanguage).toBe("de");
    });

    it("uses 'fr' as requestLanguage when French locale", async () => {
      await connector.search({ ...baseParams, connectorParams: { language: "fr" } });
      expect(getRequestBody().requestLanguage).toBe("fr");
    });
  });
});
