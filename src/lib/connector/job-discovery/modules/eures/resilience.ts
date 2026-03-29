/**
 * EURES resilience policy — built from manifest config via Shared Kernel.
 *
 * This file is a thin wrapper that provides backward compatibility.
 * The actual policy is built by buildResiliencePolicy() from the manifest.
 */

import { buildResiliencePolicy, ConnectorApiError } from "@/lib/connector/resilience";
import { euresManifest } from "./manifest";

export {
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "cockatiel";

export class EuresApiError extends ConnectorApiError {}

const resiliencePolicy = buildResiliencePolicy(euresManifest.resilience!, EuresApiError);

export const euresPolicy = { execute: resiliencePolicy.execute };

export async function resilientFetch<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  return resiliencePolicy.resilientFetch<T>(url, init, "EURES");
}
