/**
 * Google Favicon resilience policy — built from manifest config via Shared Kernel.
 *
 * Thin wrapper providing module-specific error class and policy.
 * The actual policy is built by buildResiliencePolicy() from the manifest.
 */

import { buildResiliencePolicy, ConnectorApiError } from "@/lib/connector/resilience";
import { googleFaviconManifest } from "./manifest";

export {
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "cockatiel";

export class GoogleFaviconApiError extends ConnectorApiError {}

const resiliencePolicy = buildResiliencePolicy(googleFaviconManifest.resilience!, GoogleFaviconApiError);

export const googleFaviconPolicy = { execute: resiliencePolicy.execute };
