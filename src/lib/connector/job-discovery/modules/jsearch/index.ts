import type {
  DataSourceConnector,
  ConnectorResult,
  DiscoveredVacancy,
  SearchParams,
} from "../../types";
import {
  resilientFetch,
  JSearchApiError,
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "./resilience";
import { moduleRegistry } from "@/lib/connector/registry";
import { jsearchManifest } from "./manifest";

const JSEARCH_BASE_URL = "https://jsearch.p.rapidapi.com";

interface JSearchJob {
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

interface JSearchResponse {
  status: string;
  request_id: string;
  data: JSearchJob[];
}

export function createJSearchConnector(credential?: string): DataSourceConnector {
  return {
    id: "jsearch",
    name: "JSearch",
    requiresApiKey: true,

    async search(
      params: SearchParams,
    ): Promise<ConnectorResult<DiscoveredVacancy[]>> {
      if (!credential) {
        return {
          success: false,
          error: {
            type: "blocked",
            reason: "RAPIDAPI_KEY is not configured",
          },
        };
      }

      try {
        const url = new URL(`${JSEARCH_BASE_URL}/search`);
        url.searchParams.set(
          "query",
          `${params.keywords} in ${params.location}`,
        );
        url.searchParams.set("page", "1");
        url.searchParams.set("num_pages", "1");
        url.searchParams.set("date_posted", "week");

        const data = await resilientFetch<JSearchResponse>(
          url.toString(),
          {
            method: "GET",
            headers: {
              "X-RapidAPI-Key": credential,
              "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
            },
          },
        );

        const vacancies: DiscoveredVacancy[] = (data.data || []).map(
          translateJSearchJob,
        );

        return { success: true, data: vacancies };
      } catch (error) {
        if (error instanceof BrokenCircuitError) {
          return {
            success: false,
            error: {
              type: "network" as const,
              message: "JSearch API circuit breaker open — service temporarily unavailable",
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
              message: "JSearch API request timed out",
            },
          };
        }
        if (error instanceof JSearchApiError) {
          if (error.status === 429) {
            return {
              success: false,
              error: { type: "rate_limited" as const, retryAfter: 60 },
            };
          }
          if (error.status === 403) {
            return {
              success: false,
              error: {
                type: "blocked" as const,
                reason: "API access denied - check your RapidAPI key",
              },
            };
          }
          return {
            success: false,
            error: {
              type: "network" as const,
              message: `JSearch API error: ${error.status} ${error.message}`,
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

function translateJSearchJob(job: JSearchJob): DiscoveredVacancy {
  return {
    title: job.job_title,
    employerName: job.employer_name,
    location: job.job_location || `${job.job_city}, ${job.job_state}`,
    description: job.job_description,
    sourceUrl: job.job_apply_link,
    sourceBoard: "jsearch",
    postedAt: job.job_posted_at_datetime_utc
      ? new Date(job.job_posted_at_datetime_utc)
      : undefined,
    salary: formatSalary(job),
    employmentType: mapEmploymentType(job.job_employment_type),
    externalId: job.job_id,
  };
}

function mapEmploymentType(
  raw?: string,
): "full_time" | "part_time" | "contract" | undefined {
  if (!raw) return undefined;
  switch (raw.toLowerCase()) {
    case "fulltime":
    case "full_time":
    case "full-time":
      return "full_time";
    case "parttime":
    case "part_time":
    case "part-time":
      return "part_time";
    case "contractor":
    case "contract":
      return "contract";
    default:
      return undefined;
  }
}

function formatSalary(job: JSearchJob): string | undefined {
  if (!job.job_min_salary && !job.job_max_salary) {
    return undefined;
  }

  const min = job.job_min_salary;
  const max = job.job_max_salary;
  const period = job.job_salary_period || "year";

  if (min && max) {
    return `$${min.toLocaleString()} - $${max.toLocaleString()} per ${period}`;
  }
  if (min) {
    return `From $${min.toLocaleString()} per ${period}`;
  }
  if (max) {
    return `Up to $${max.toLocaleString()} per ${period}`;
  }
  return undefined;
}

// Self-registration
moduleRegistry.register(jsearchManifest, createJSearchConnector);
