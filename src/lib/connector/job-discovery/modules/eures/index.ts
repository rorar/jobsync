import type {
  DataSourceConnector,
  ConnectorResult,
  DiscoveredVacancy,
  SearchParams,
} from "../../types";
import type { components } from "./generated";

type EuresSearchRequest = components["schemas"]["JobSearchRequest"];
type EuresSearchResponse = components["schemas"]["JobSearchResponse"];
type EuresVacancyDetail = components["schemas"]["JobVacancyDetail"];
import { translateEuresVacancy } from "./translator";
import {
  resilientFetch,
  EuresApiError,
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "./resilience";
import { parseKeywords, parseLocations } from "@/utils/automation.utils";

const EURES_API_BASE = "https://europa.eu/eures/api";
const EURES_SEARCH_URL = `${EURES_API_BASE}/jv-searchengine/public/jv-search/search`;
const EURES_DETAIL_URL = `${EURES_API_BASE}/jv-searchengine/public/jv/id`;

/**
 * Translates a EURES detail response into a DiscoveredVacancy.
 * Falls back to the first available profile when the requested language is missing.
 * Returns a minimal stub (empty strings) if no profiles exist at all — the API
 * types declare jvProfiles as non-nullable but empty objects occur in practice.
 */
function translateDetail(
  detail: EuresVacancyDetail,
  language: string,
): DiscoveredVacancy {
  const profile = detail.jvProfiles[language] ?? Object.values(detail.jvProfiles)[0];
  if (!profile) {
    return {
      title: "",
      employerName: "",
      location: "Europe",
      description: "",
      sourceUrl: `https://europa.eu/eures/portal/jv-se/jv-details/${detail.id}`,
      sourceBoard: "eures",
      externalId: detail.id,
    };
  }

  const location = profile.locations?.[0];
  const locationStr = location?.cityName && location?.countryCode
    ? `${location.cityName}, ${location.countryCode.toUpperCase()}`
    : location?.countryCode?.toUpperCase() ?? "Europe";

  return {
    title: profile.title ?? "",
    employerName: profile.employer?.name ?? "",
    location: locationStr,
    description: stripDetailHtml(profile.description ?? ""),
    sourceUrl: `https://europa.eu/eures/portal/jv-se/jv-details/${detail.id}`,
    sourceBoard: "eures",
    postedAt: detail.creationDate ? new Date(detail.creationDate) : undefined,
    employmentType: mapDetailScheduleCode(profile.positionScheduleCodes),
    externalId: detail.id,
    applicationDeadline: profile.lastApplicationDate ?? undefined,
    applicationInstructions: profile.applicationInstructions
      ? stripDetailHtml(profile.applicationInstructions.join("\n"))
      : undefined,
  };
}

function stripDetailHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mapDetailScheduleCode(
  codes?: string[],
): "full_time" | "part_time" | "contract" | undefined {
  if (!codes || codes.length === 0) return undefined;
  const code = codes[0];
  switch (code) {
    case "FullTime": return "full_time";
    case "PartTime": return "part_time";
    case "FlexTime": return "part_time";
    default: return undefined;
  }
}

export function createEuresConnector(): DataSourceConnector {
  return {
    id: "eures",
    name: "EURES",
    requiresApiKey: false,

    async search(
      params: SearchParams,
    ): Promise<ConnectorResult<DiscoveredVacancy[]>> {
      try {
        const connectorParams = params.connectorParams ?? {};
        const requestLanguage = (connectorParams.language as string) ?? "en";
        const locationCodes = params.location
          ? parseLocations(params.location).map((code) => {
                const lower = code.toLowerCase();
                // Convert "de-ns" storage format to EURES API "NS" within country context
                if (lower.endsWith("-ns")) return lower.slice(0, -3).toUpperCase() + "-NS";
                return lower;
              })
          : [];

        // Read configurable params from connectorParams with sensible defaults.
        // Type assertions align runtime values with the generated EURES OpenAPI types.
        type PublicationPeriod = NonNullable<EuresSearchRequest["publicationPeriod"]>;
        type SortOrder = EuresSearchRequest["sortSearch"];
        type ExperienceCode = NonNullable<EuresSearchRequest["requiredExperienceCodes"]>[number];
        type OfferingCode = NonNullable<EuresSearchRequest["positionOfferingCodes"]>[number];
        type ScheduleCode = NonNullable<EuresSearchRequest["positionScheduleCodes"]>[number];
        type EducationCode = NonNullable<EuresSearchRequest["educationAndQualificationLevelCodes"]>[number];
        type SectorCode = NonNullable<EuresSearchRequest["sectorCodes"]>[number];
        type FlagCode = NonNullable<EuresSearchRequest["euresFlagCodes"]>[number];

        const publicationPeriod = ((connectorParams.publicationPeriod as string) || "LAST_WEEK") as PublicationPeriod;
        const sortSearch = ((connectorParams.sortSearch as string) || "MOST_RECENT") as SortOrder;
        type SpecificSearchCode = NonNullable<NonNullable<EuresSearchRequest["keywords"]>[number]["specificSearchCode"]>;
        const specificSearchCode = ((connectorParams.specificSearchCode as string) || "EVERYWHERE") as SpecificSearchCode;
        const requiredExperienceCodes = ((connectorParams.requiredExperienceCodes as string[]) ?? []) as ExperienceCode[];
        const positionOfferingCodes = ((connectorParams.positionOfferingCodes as string[]) ?? []) as OfferingCode[];
        const positionScheduleCodes = ((connectorParams.positionScheduleCodes as string[]) ?? []) as ScheduleCode[];
        const educationLevelCodes = ((connectorParams.educationLevelCodes as string[]) ?? []) as EducationCode[];
        const sectorCodes = ((connectorParams.sectorCodes as string[]) ?? []) as SectorCode[];
        const euresFlagCodes = ((connectorParams.euresFlagCodes as string[]) ?? []) as FlagCode[];
        // requiredLanguages comes as comma-separated string, e.g. "de(B2), en(C1)"
        const requiredLanguagesRaw = (connectorParams.requiredLanguages as string) ?? "";
        const requiredLanguages = requiredLanguagesRaw
          ? requiredLanguagesRaw.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];

        // Separate ESCO occupation URIs from free-text keywords.
        // The EuresOccupationCombobox stores ESCO URIs as keywords,
        // but the EURES API needs them in occupationUris, not in keywords.
        const allKeywords = parseKeywords(params.keywords);
        const escoUriPrefix = "http://data.europa.eu/esco/";
        const occupationUris = allKeywords.filter((k) => k.startsWith(escoUriPrefix));
        const freeTextKeywords = allKeywords.filter((k) => !k.startsWith(escoUriPrefix));

        const RESULTS_PER_PAGE = 50;
        const baseBody: EuresSearchRequest = {
          resultsPerPage: RESULTS_PER_PAGE,
          page: 1,
          sortSearch,
          keywords: freeTextKeywords.map((keyword) => ({
              keyword,
              specificSearchCode,
            })),
          publicationPeriod,
          occupationUris,
          skillUris: [],
          requiredExperienceCodes,
          positionScheduleCodes,
          sectorCodes,
          educationAndQualificationLevelCodes: educationLevelCodes,
          positionOfferingCodes,
          locationCodes,
          euresFlagCodes,
          otherBenefitsCodes: [],
          requiredLanguages,
          minNumberPost: null,
          sessionId: `jobsync-${Date.now()}`,
          userPreferredLanguage: null,
          requestLanguage,
        };

        const allVacancies: DiscoveredVacancy[] = [];
        let page = 1;
        const MAX_PAGES = 10; // P-7.1: Cap pagination to prevent unbounded memory/latency

        while (page <= MAX_PAGES) {
          const data = await resilientFetch<EuresSearchResponse>(
            EURES_SEARCH_URL,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({ ...baseBody, page }),
            },
          );
          const jvs = data.jvs || [];

          if (jvs.length === 0) break;

          for (const jv of jvs) {
            allVacancies.push(translateEuresVacancy(jv, requestLanguage));
          }

          if (allVacancies.length >= data.numberRecords) break;

          page++;
        }

        return { success: true, data: allVacancies };
      } catch (error) {
        if (error instanceof EuresApiError) {
          if (error.status === 429) {
            return {
              success: false,
              error: { type: "rate_limited" as const, retryAfter: 60 },
            };
          }
          return {
            success: false,
            error: {
              type: "network" as const,
              message: `EURES API error: ${error.status}`,
            },
          };
        }
        if (error instanceof BrokenCircuitError) {
          return {
            success: false,
            error: {
              type: "network" as const,
              message: "EURES API circuit breaker open — service temporarily unavailable",
            },
          };
        }
        if (error instanceof BulkheadRejectedError) {
          return {
            success: false,
            error: { type: "rate_limited" as const, retryAfter: 30 },
          };
        }
        if (error instanceof TaskCancelledError) {
          return {
            success: false,
            error: {
              type: "network" as const,
              message: "EURES API request timed out",
            },
          };
        }
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: { type: "network", message } };
      }
    },

    async getDetails(
      externalId: string,
    ): Promise<ConnectorResult<DiscoveredVacancy>> {
      try {
        // requestLang query param ensures the API returns the vacancy in the requested language
        const detailUrl = `${EURES_DETAIL_URL}/${encodeURIComponent(externalId)}?requestLang=en`;
        const detail = await resilientFetch<EuresVacancyDetail>(
          detailUrl,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          },
        );

        return { success: true, data: translateDetail(detail, "en") };
      } catch (error) {
        if (error instanceof EuresApiError) {
          if (error.status === 429) {
            return {
              success: false,
              error: { type: "rate_limited" as const, retryAfter: 60 },
            };
          }
          return {
            success: false,
            error: {
              type: "network" as const,
              message: `EURES API error: ${error.status}`,
            },
          };
        }
        if (error instanceof BrokenCircuitError) {
          return {
            success: false,
            error: {
              type: "network" as const,
              message: "EURES API circuit breaker open — service temporarily unavailable",
            },
          };
        }
        if (error instanceof BulkheadRejectedError) {
          return {
            success: false,
            error: { type: "rate_limited" as const, retryAfter: 30 },
          };
        }
        if (error instanceof TaskCancelledError) {
          return {
            success: false,
            error: {
              type: "network" as const,
              message: "EURES API request timed out",
            },
          };
        }
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: { type: "network", message } };
      }
    },
  };
}
