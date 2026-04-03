/**
 * Clearbit resilience policy — built from manifest config via Shared Kernel.
 *
 * Thin wrapper providing module-specific error class and policy.
 * The actual policy is built by buildResiliencePolicy() from the manifest.
 */

import { buildResiliencePolicy, ConnectorApiError } from "@/lib/connector/resilience";
import { clearbitManifest } from "./manifest";

export {
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "cockatiel";

export class ClearbitApiError extends ConnectorApiError {}

const resiliencePolicy = buildResiliencePolicy(clearbitManifest.resilience!, ClearbitApiError);

export const clearbitPolicy = { execute: resiliencePolicy.execute };
