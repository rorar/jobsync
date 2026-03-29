/**
 * JSearch resilience policy — built from manifest config via Shared Kernel.
 *
 * Thin wrapper providing module-specific error class and resilientFetch.
 * The actual policy is built by buildResiliencePolicy() from the manifest.
 */

import { buildResiliencePolicy, ConnectorApiError } from "@/lib/connector/resilience";
import { jsearchManifest } from "./manifest";

export {
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "cockatiel";

export class JSearchApiError extends ConnectorApiError {}

const resiliencePolicy = buildResiliencePolicy(
  jsearchManifest.resilience!,
  JSearchApiError,
);

export async function resilientFetch<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  return resiliencePolicy.resilientFetch<T>(url, init, "JSearch");
}
