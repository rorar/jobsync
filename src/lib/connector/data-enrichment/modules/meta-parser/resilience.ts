/**
 * Meta Parser resilience policy — built from manifest config via Shared Kernel.
 *
 * Thin wrapper providing module-specific error class and policy.
 * The actual policy is built by buildResiliencePolicy() from the manifest.
 */

import { buildResiliencePolicy, ConnectorApiError } from "@/lib/connector/resilience";
import { metaParserManifest } from "./manifest";

export {
  BrokenCircuitError,
  TaskCancelledError,
  BulkheadRejectedError,
} from "cockatiel";

export class MetaParserApiError extends ConnectorApiError {}

const resiliencePolicy = buildResiliencePolicy(metaParserManifest.resilience!, MetaParserApiError);

export const metaParserPolicy = { execute: resiliencePolicy.execute };
