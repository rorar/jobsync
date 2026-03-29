"use server";

import { moduleRegistry } from "@/lib/connector/registry";
import "@/lib/connector/job-discovery/connectors";
import "@/lib/connector/ai-provider/modules/connectors";
import {
  ConnectorType,
  CredentialType,
} from "@/lib/connector/manifest";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";

/** Serializable manifest summary for client components */
export interface ModuleManifestSummary {
  moduleId: string;
  name: string;
  connectorType: string;
  credential: {
    type: string;
    moduleId: string;
    required: boolean;
    sensitive: boolean;
    placeholder?: string;
    defaultValue?: string;
  };
}

export async function getModuleManifests(
  connectorType?: ConnectorType,
): Promise<ActionResult<ModuleManifestSummary[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, message: "Not authenticated" };

  const modules = connectorType
    ? moduleRegistry.getByType(connectorType)
    : [
        ...moduleRegistry.getByType(ConnectorType.JOB_DISCOVERY),
        ...moduleRegistry.getByType(ConnectorType.AI_PROVIDER),
      ];

  const summaries: ModuleManifestSummary[] = modules.map((m) => ({
    moduleId: m.manifest.id,
    name: m.manifest.name,
    connectorType: m.manifest.connectorType,
    credential: {
      type: m.manifest.credential.type,
      moduleId: m.manifest.credential.moduleId,
      required: m.manifest.credential.required,
      sensitive: m.manifest.credential.sensitive,
      placeholder: m.manifest.credential.placeholder,
      defaultValue: m.manifest.credential.defaultValue,
    },
  }));

  return { success: true, data: summaries };
}

/**
 * Get manifests that require user credentials (for settings UI).
 * Filters out modules with CredentialType.NONE.
 */
export async function getCredentialModules(): Promise<
  ActionResult<ModuleManifestSummary[]>
> {
  const result = await getModuleManifests();
  if (!result.success || !result.data) return result;

  const filtered = result.data.filter(
    (m) => m.credential.type !== CredentialType.NONE,
  );

  return { success: true, data: filtered };
}
