/**
 * Arbeitsagentur resilience policy — built from manifest config via Shared Kernel.
 *
 * This file is a thin wrapper that provides backward compatibility.
 * The actual policy is built by buildResiliencePolicy() from the manifest.
 */

import { buildResiliencePolicy, ConnectorApiError } from "@/lib/connector/resilience";
import { arbeitsagenturManifest } from "./manifest";

export {
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "cockatiel";

export class ArbeitsagenturApiError extends ConnectorApiError {}

const resiliencePolicy = buildResiliencePolicy(arbeitsagenturManifest.resilience!, ArbeitsagenturApiError);

export const arbeitsagenturPolicy = { execute: resiliencePolicy.execute };

export async function resilientFetch<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  return resiliencePolicy.resilientFetch<T>(url, init, "Arbeitsagentur");
}
