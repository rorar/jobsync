import "../register-all"; // trigger all module registrations
import { AiModuleId } from "@/models/ai.model";
import { aiProviderRegistry } from "./registry";

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
    throw new Error(message);
  }
  return result.data;
}
