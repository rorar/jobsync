// Canonical domain type: what "a job discovered by automation" means in JobSync
export interface DiscoveredVacancy {
  title: string;
  employerName: string;
  location: string;
  description: string;
  sourceUrl: string;
  sourceBoard: string;
  postedAt?: Date;
  salary?: string;
  employmentType?: "full_time" | "part_time" | "contract";
  externalId?: string;
  /** ISO 8601 date string (e.g. "2026-03-15") from the job board; format varies by connector. */
  applicationDeadline?: string;
  /** Free-text application instructions, HTML-stripped. May contain multi-paragraph content from the source board. */
  applicationInstructions?: string;

  // --- Extended fields (ROADMAP 1.1b Phase 1) ---

  /** Employer website URL (may be bare domain without protocol). */
  companyUrl?: string;
  /** Free-text employer description. */
  companyDescription?: string;
  /** NACE sector codes associated with the employer. */
  industryCodes?: string[];
  /** Employer organisation size code (e.g. "small", "medium", "large"). */
  companySize?: string;
  /** Contract/offering type: apprenticeship, contract, directhire, internship, seasonal, etc. */
  positionOfferingCode?: string;
  /** Number of open positions for this vacancy. */
  numberOfPosts?: number;
  /** ESCO Occupation URIs classifying this vacancy. */
  occupationUris?: string[];
  /** Required education level code (e.g. "bachelor", "master", "basic"). */
  requiredEducationLevel?: string;
  /** Required years of experience. */
  requiredExperienceYears?: number;
  /** ISO 639-1 codes of workplace languages. */
  workingLanguages?: string[];
  /** Structured salary: minimum amount. */
  salaryMin?: number;
  /** Structured salary: maximum amount. */
  salaryMax?: number;
  /** Salary currency (ISO 4217, e.g. "EUR"). */
  salaryCurrency?: string;
  /** Salary period: "monthly", "yearly", "hourly", etc. */
  salaryPeriod?: string;
  /** Whether the position is available for immediate start. */
  immediateStart?: boolean;
  /** Human-readable contract start date text. */
  contractStartDate?: string;
  /** Human-readable contract end date text. */
  contractEndDate?: string;
  /** Whether the vacancy is a EURES cross-border opportunity. */
  euresFlag?: boolean;
}

export type ConnectorError =
  | { type: "blocked"; reason: string }
  | { type: "rate_limited"; retryAfter?: number }
  | { type: "network"; message: string }
  | { type: "parse"; message: string };

export type ConnectorResult<T> =
  | { success: true; data: T }
  | { success: false; error: ConnectorError };

export interface SearchParams {
  keywords: string;
  location: string;
  connectorParams?: Record<string, unknown>;
}

export interface GetDetailsOptions {
  /** Preferred response language (ISO 639-1, e.g. "de", "fr"). Defaults to "en". */
  language?: string;
}

export interface DataSourceConnector {
  readonly id: string;
  readonly name: string;
  readonly requiresApiKey: boolean;
  search(params: SearchParams): Promise<ConnectorResult<DiscoveredVacancy[]>>;
  getDetails?(externalId: string, options?: GetDetailsOptions): Promise<ConnectorResult<DiscoveredVacancy>>;
}
