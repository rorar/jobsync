/**
 * Logo.dev resilience policy — built from manifest config via Shared Kernel.
 *
 * Thin wrapper providing module-specific error class and policy.
 * The actual policy is built by buildResiliencePolicy() from the manifest.
 */

import { buildResiliencePolicy, ConnectorApiError } from "@/lib/connector/resilience";
import { logoDevManifest } from "./manifest";

export {
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "cockatiel";

export class LogoDevApiError extends ConnectorApiError {}

const resiliencePolicy = buildResiliencePolicy(logoDevManifest.resilience!, LogoDevApiError);

export const logoDevPolicy = { execute: resiliencePolicy.execute };
