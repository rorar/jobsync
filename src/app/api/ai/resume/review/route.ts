import "server-only";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { streamText, Output } from "ai";
import { getModel } from "@/lib/connector/ai-provider/providers";
import { checkRateLimit } from "@/lib/connector/ai-provider/rate-limiter";
import {
  ResumeReviewSchema,
  RESUME_REVIEW_SYSTEM_PROMPT,
  buildResumeReviewPrompt,
  AIUnavailableError,
  preprocessResume,
} from "@/lib/connector/ai-provider";
import { TEXT_LIMITS } from "@/lib/connector/ai-provider/config";
import { moduleRegistry } from "@/lib/connector/registry";
import { Resume } from "@/models/profile.model";
import { AiModel } from "@/models/ai.model";
import { AiManifest } from "@/lib/connector/manifest";

/**
 * Resume Review Endpoint
 * Single comprehensive LLM call for complete resume analysis
 */
export const POST = async (req: NextRequest) => {
  const session = await auth();
  const userId = session?.user?.id;

  if (!session || !userId) {
    return NextResponse.json({ message: "Not Authenticated" }, { status: 401 });
  }

  // Rate limiting
  const rateLimit = checkRateLimit(userId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Try again in ${Math.ceil(
          rateLimit.resetIn / 1000,
        )} seconds.`,
      },
      { status: 429 },
    );
  }

  const { selectedModel, resume } = (await req.json()) as {
    selectedModel: AiModel;
    resume: Resume;
  };

  if (!resume || !selectedModel) {
    return NextResponse.json(
      { error: "Resume and model selection required" },
      { status: 400 },
    );
  }

  try {
    // Resolve module's isLocal flag for PII stripping (fail-safe: strip by default)
    const registeredModule = moduleRegistry.get(selectedModel.moduleId);
    const isLocal = (registeredModule?.manifest as AiManifest | undefined)?.isLocal ?? false;
    const stripPii = !isLocal;
    const limits = isLocal ? TEXT_LIMITS.OLLAMA : TEXT_LIMITS.CLOUD;

    const preprocessResult = await preprocessResume(resume, { stripPii, resumeCharLimit: limits.RESUME });
    if (!preprocessResult.success) {
      return NextResponse.json(
        {
          error: preprocessResult.error.message,
          code: preprocessResult.error.code,
        },
        { status: 400 },
      );
    }
    const { normalizedText } = preprocessResult.data;

    const model = await getModel(
      selectedModel.moduleId,
      selectedModel.model || "llama3.2",
      userId,
    );

    // Single comprehensive LLM call
    const result = streamText({
      model,
      output: Output.object({
        schema: ResumeReviewSchema,
      }),
      system: RESUME_REVIEW_SYSTEM_PROMPT,
      prompt: buildResumeReviewPrompt(normalizedText),
      temperature: 0.3,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Resume review error:", error);

    if (error instanceof AIUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    const message =
      error instanceof Error ? error.message : "AI request failed";

    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      return NextResponse.json(
        {
          error: `Cannot connect to ${selectedModel.moduleId} module. Please ensure the module is running.`,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
};
