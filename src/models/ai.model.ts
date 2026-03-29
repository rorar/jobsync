// Re-export types from schemas
export type {
  ResumeReviewResponse,
  JobMatchResponse,
  RequirementMet,
  RequirementMissing,
  RequirementPartial,
  SkillsAnalysis,
  ExperienceAnalysis,
  KeywordsAnalysis,
  TailoringTip,
} from "./ai.schemas";
export { ResumeReviewSchema, JobMatchSchema } from "./ai.schemas";

// AI MODEL

export interface AiModel {
  moduleId: AiModuleId;
  model: string | undefined;
}

// AI Module ID enum — identifies which external system (Module) to use
export enum AiModuleId {
  OLLAMA = "ollama",
  OPENAI = "openai",
  DEEPSEEK = "deepseek",
}

// Default models per module
export enum OllamaModel {
  LLAMA3_1 = "llama3.1",
  LLAMA3_2 = "llama3.2",
}

export enum OpenaiModel {
  GPT3_5 = "gpt-3.5-turbo",
  GPT4O = "gpt-4o",
  GPT4O_MINI = "gpt-4o-mini",
}

export enum DeepseekModel {
  DEEPSEEK_CHAT = "deepseek-chat",
  DEEPSEEK_REASONER = "deepseek-reasoner",
}

export const defaultModel: AiModel = {
  moduleId: AiModuleId.OLLAMA,
  model: OllamaModel.LLAMA3_1,
};
