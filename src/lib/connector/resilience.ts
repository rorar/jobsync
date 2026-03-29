/**
 * Resilience Shared Kernel — builds Cockatiel policies from manifest config.
 *
 * Replaces the duplicated resilience.ts files in eures/ and arbeitsagentur/.
 * Each module gets a configured policy based on its manifest.resilience field.
 *
 * See: specs/module-lifecycle.allium, Phase 5
 */

import {
  retry,
  circuitBreaker,
  timeout,
  bulkhead,
  wrap,
  handleWhen,
  ConsecutiveBreaker,
  ExponentialBackoff,
  TimeoutStrategy,
  type IPolicy,
} from "cockatiel";

import { TokenBucketRateLimiter } from "./job-discovery/modules/eures/rate-limiter";
import type { ResilienceConfig } from "./manifest";

export {
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "cockatiel";

/** Generic API error for resilience handling across all modules */
export class ConnectorApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ResiliencePolicy {
  /** Wrapped Cockatiel policy for executing resilient operations */
  execute: <T>(fn: (context: { signal: AbortSignal }) => Promise<T>) => Promise<T>;
  /** Rate limiter (if configured) */
  rateLimiter?: TokenBucketRateLimiter;
  /** Execute a fetch through the full resilience stack (rate limit + policy) */
  resilientFetch<T>(url: string, init: RequestInit, moduleName?: string): Promise<T>;
}

/**
 * Build a Cockatiel resilience policy from a manifest's ResilienceConfig.
 * Returns a composed policy + rate limiter + convenience resilientFetch function.
 */
export function buildResiliencePolicy(
  config: ResilienceConfig,
  errorClass: new (status: number, message: string) => Error = ConnectorApiError,
): ResiliencePolicy {
  const policies: IPolicy[] = [];

  // Retry
  if (config.retryAttempts > 0) {
    const backoff =
      config.retryBackoff === "exponential"
        ? new ExponentialBackoff()
        : undefined;

    policies.push(
      retry(
        handleWhen((err) => {
          if (err instanceof errorClass) {
            return (err as ConnectorApiError).status >= 500 ||
              (err as ConnectorApiError).status === 429;
          }
          return true; // network errors
        }),
        { maxAttempts: config.retryAttempts, backoff },
      ),
    );
  }

  // Circuit Breaker
  if (config.circuitBreaker) {
    policies.push(
      circuitBreaker(
        handleWhen((err) => {
          if (err instanceof errorClass) {
            return (err as ConnectorApiError).status >= 500;
          }
          return true;
        }),
        {
          halfOpenAfter: config.circuitBreakerCooldownMs,
          breaker: new ConsecutiveBreaker(config.circuitBreakerThreshold),
        },
      ),
    );
  }

  // Timeout
  if (config.timeoutMs > 0) {
    policies.push(timeout(config.timeoutMs, TimeoutStrategy.Cooperative));
  }

  // Bulkhead
  if (config.maxConcurrent && config.maxConcurrent > 0) {
    policies.push(bulkhead(config.maxConcurrent, config.maxConcurrent * 2));
  }

  const composedPolicy = policies.length > 0 ? wrap(...policies) : wrap();

  // Rate Limiter
  const rateLimiter =
    config.rateLimitTokens && config.rateLimitRefillMs
      ? new TokenBucketRateLimiter(config.rateLimitTokens, config.rateLimitRefillMs)
      : undefined;

  return {
    execute: <T>(fn: (context: { signal: AbortSignal }) => Promise<T>) =>
      composedPolicy.execute(fn) as Promise<T>,
    rateLimiter,
    async resilientFetch<T>(url: string, init: RequestInit, moduleName = "API"): Promise<T> {
      if (rateLimiter) {
        await rateLimiter.acquire();
      }
      return composedPolicy.execute(async ({ signal }) => {
        const response = await fetch(url, { ...init, signal });
        if (!response.ok) {
          throw new errorClass(
            response.status,
            `${moduleName} API error: ${response.status} ${response.statusText}`,
          );
        }
        return response.json() as T;
      }) as Promise<T>;
    },
  };
}
