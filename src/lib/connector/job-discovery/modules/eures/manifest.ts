import { ConnectorType, CredentialType, type JobDiscoveryManifest, type DependencyHealthCheck } from "@/lib/connector/manifest";
import { CACHE_POLICY_SEARCH } from "@/lib/connector/cache";

export const euresManifest: JobDiscoveryManifest = {
  id: "eures",
  name: "EURES",
  manifestVersion: 1,
  connectorType: ConnectorType.JOB_DISCOVERY,
  automationType: "discovery",
  credential: {
    type: CredentialType.NONE,
    moduleId: "eures",
    required: false,
    sensitive: false,
  },
  healthCheck: {
    endpoint: "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search",
    timeoutMs: 15000,
    intervalMs: 300000,
  },
  resilience: {
    retryAttempts: 3,
    retryBackoff: "exponential",
    circuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerCooldownMs: 30000,
    timeoutMs: 15000,
    rateLimitTokens: 3,
    rateLimitRefillMs: 500,
    maxConcurrent: 5,
  },
  cachePolicy: CACHE_POLICY_SEARCH,
  dependencies: [
    {
      id: "esco_classification",
      name: "ESCO Classification",
      endpoint: "https://ec.europa.eu/esco/api/search?text=test&language=en&type=occupation&limit=1",
      timeoutMs: 10000,
      required: false,
      usedFor: "Occupation search in Automation Wizard (EuresOccupationCombobox)",
    },
    {
      id: "eurostat_nuts",
      name: "Eurostat NUTS Regions",
      endpoint: "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/GEO?format=JSON&lang=en",
      timeoutMs: 10000,
      required: false,
      usedFor: "Region name i18n in location hierarchy (EuresLocationCombobox)",
    },
    {
      id: "eures_country_stats",
      name: "EURES Country Stats",
      endpoint: "https://europa.eu/eures/api/jv-searchengine/public/statistics/getCountryStats",
      timeoutMs: 10000,
      required: false,
      usedFor: "Country/region job counts in location hierarchy",
    },
  ] satisfies DependencyHealthCheck[],
  searchFieldOverrides: [
    { field: "keywords", widgetId: "eures-occupation" },
    { field: "location", widgetId: "eures-location" },
  ],
  connectorParamsSchema: [
    // Time filter (ROADMAP 3.7)
    {
      key: "publicationPeriod", type: "select", label: "automations.params.publicationPeriod",
      defaultValue: "LAST_WEEK", options: ["LAST_DAY", "LAST_THREE_DAYS", "LAST_WEEK", "LAST_MONTH"],
    },
    // Experience level
    {
      key: "requiredExperienceCodes", type: "multiselect", label: "automations.params.experienceLevel",
      options: ["none_required", "up_to_1_year", "between_1_and_2_years", "between_2_and_5_years", "more_than_5_years"],
    },
    // Employment/offering type
    {
      key: "positionOfferingCodes", type: "multiselect", label: "automations.params.positionOffering",
      options: ["directhire", "contract", "temporary", "internship", "apprenticeship", "selfemployed", "seasonal", "volunteer"],
    },
    // Working time
    {
      key: "positionScheduleCodes", type: "multiselect", label: "automations.params.workingTime",
      options: ["fulltime", "parttime", "flextime"],
    },
    // Education level
    {
      key: "educationLevelCodes", type: "multiselect", label: "automations.params.educationLevel",
      options: ["basic", "medium", "bachelor", "master", "tertiary", "doctoral"],
    },
    // Industry/sector (NACE codes)
    {
      key: "sectorCodes", type: "multiselect", label: "automations.params.sector",
      options: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u"],
    },
    // EURES cross-border flag
    {
      key: "euresFlagCodes", type: "multiselect", label: "automations.params.euresFlag",
      options: ["WITH", "WITHOUT"],
    },
    // Required languages (format: "de(C2)", "en(B1)")
    {
      key: "requiredLanguages", type: "string", label: "automations.params.requiredLanguages",
      placeholder: "de(B2), en(C1)",
    },
    // Keyword search scope
    {
      key: "specificSearchCode", type: "select", label: "automations.params.keywordSearchScope",
      defaultValue: "EVERYWHERE", options: ["EVERYWHERE", "TITLE", "DESCRIPTION", "EMPLOYER"],
    },
    // Sort order
    {
      key: "sortSearch", type: "select", label: "automations.params.sortOrder",
      defaultValue: "MOST_RECENT", options: ["BEST_MATCH", "MOST_RECENT"],
    },
  ],
};
