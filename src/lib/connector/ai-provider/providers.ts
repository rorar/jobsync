import "../register-all"; // trigger all module registrations
import { AiModuleId } from "@/models/ai.model";
import { aiProviderRegistry } from "./registry";
import { handleAuthFailure } from "../degradation";

export async function getModel(
  moduleId: AiModuleId,
  modelName: string,
  userId?: string,
) {
  const connector = aiProviderRegistry.create(moduleId);
  const result = await connector.createModel(modelName, userId);
  if (!result.success) {
    const message =
      "message" in result.error
        ? result.error.message
        : `Module rate limited`;

    // G2b fix: wire auth failures to degradation bridge so automations
    // using this AI module get paused + users receive notifications
    if (result.error.type === "auth_failed") {
      void handleAuthFailure(moduleId, message).catch((err) => {
        console.error("[AI Provider] handleAuthFailure failed:", err);
      });
    }

    throw new Error(message);
  }
  return result.data;
}
