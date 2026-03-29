"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Info, Sparkles, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import Loading from "../Loading";
import { useState, useEffect, useMemo } from "react";
import { toast } from "../ui/use-toast";
import { Resume } from "@/models/profile.model";
import { AiModel, defaultModel } from "@/models/ai.model";
import { AiResumeReviewResponseContent } from "./AiResumeReviewResponseContent";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { checkIfModelIsRunning } from "@/utils/ai.utils";
import { ResumeReviewSchema } from "@/models/ai.schemas";
import { getUserSettings } from "@/actions/userSettings.actions";
import { useTranslations } from "@/i18n";
import Link from "next/link";

interface AiSectionProps {
  resume: Resume;
}

const AiResumeReviewSection = ({ resume }: AiSectionProps) => {
  const { t } = useTranslations();
  const [aISectionOpen, setAiSectionOpen] = useState(false);
  const [runningModelName, setRunningModelName] = useState<string>("");
  const [runningModelError, setRunningModelError] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<AiModel>(defaultModel);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [hasAiProvider, setHasAiProvider] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const result = await getUserSettings();
        if (result.success && (result.data as any)?.settings?.ai) {
          const aiSettings = (result.data as any).settings.ai;
          const model = aiSettings.model;
          setSelectedModel({
            moduleId: aiSettings.moduleId || aiSettings.provider || defaultModel.moduleId,
            model,
          });
          setHasAiProvider(!!model);
        } else {
          setHasAiProvider(false);
        }
      } catch (error) {
        console.error("Error fetching AI settings:", error);
        setHasAiProvider(false);
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetchSettings();
  }, []);

  // Standard single-agent mode
  const { object, submit, isLoading, stop } = useObject({
    api: "/api/ai/resume/review",
    schema: ResumeReviewSchema,
    onError: (err) => {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: err.message || "Failed to get AI review",
      });
    },
  });

  const getResumeReview = () => {
    if (!resume || resume.ResumeSections?.length === 0) {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: "Resume content is required",
      });
      return;
    }

    submit({ selectedModel, resume });
  };

  const triggerSheetChange = async (openState: boolean) => {
    setAiSectionOpen(openState);
    if (!openState && isLoading) {
      stop();
    } else if (openState && selectedModel.moduleId === "ollama") {
      await checkModelStatus();
    }
  };

  const checkModelStatus = async () => {
    setRunningModelName("");
    setRunningModelError("");
    const result = await checkIfModelIsRunning(
      selectedModel.model,
      selectedModel.moduleId
    );
    if (result.isRunning && result.runningModelName) {
      setRunningModelName(result.runningModelName);
    } else if (result.error) {
      setRunningModelError(result.error);
    }
  };

  // Check if we have any content to show
  const hasContent = object && (object.scores?.overall !== undefined || object.summary);

  const sectionCount = resume.ResumeSections?.length ?? 0;
  const isButtonDisabled = isLoading || isLoadingSettings || sectionCount < 2 || !hasAiProvider;

  const tooltipMessage = useMemo(() => {
    if (isLoadingSettings) return "Loading AI settings...";
    if (!hasAiProvider) return "No AI model configured \u2014 go to Settings > AI";
    if (sectionCount < 2) return "Add at least 2 resume sections before requesting a review";
    return null;
  }, [isLoadingSettings, hasAiProvider, sectionCount]);

  return (
    <Sheet open={aISectionOpen} onOpenChange={triggerSheetChange}>
      <div className="ml-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={isButtonDisabled ? 0 : undefined}>
                <SheetTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 cursor-pointer"
                    onClick={() => triggerSheetChange(true)}
                    disabled={isButtonDisabled}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                      Review
                    </span>
                  </Button>
                </SheetTrigger>
              </span>
            </TooltipTrigger>
            {tooltipMessage && (
              <TooltipContent>
                <p>{tooltipMessage}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
      <SheetPortal>
        <SheetContent className="overflow-y-scroll">
          <SheetHeader>
            <SheetTitle className="flex flex-row items-center">
              AI Review ({selectedModel.moduleId})
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground mx-1" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{`Provider: ${selectedModel.moduleId}`}</p>
                    <p>{`Model: ${selectedModel.model}`}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </SheetTitle>
          </SheetHeader>

          {!hasAiProvider && !isLoadingSettings && (
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 mt-4 dark:border-amber-600 dark:bg-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  No AI Provider
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Configure an AI provider in{" "}
                  <Link
                    href="/dashboard/settings"
                    className="underline font-medium hover:text-amber-900 dark:hover:text-amber-100"
                  >
                    Settings
                  </Link>{" "}
                  to enable resume review.
                </p>
              </div>
            </div>
          )}

          {selectedModel.moduleId === "ollama" && (
            <>
              {runningModelName && (
                <div className="flex items-center gap-1 text-green-600 text-sm mt-4">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{runningModelName} is running</span>
                </div>
              )}
              {runningModelError && (
                <div className="flex items-center gap-1 text-red-600 text-sm mt-4">
                  <XCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{runningModelError}</span>
                </div>
              )}
            </>
          )}

          <div className="mt-4">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 cursor-pointer"
              onClick={getResumeReview}
              disabled={
                isLoading ||
                (selectedModel.moduleId === "ollama" && !runningModelName)
              }
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Generate AI Review
              </span>
            </Button>
          </div>

          {isLoading && !hasContent ? (
            <div className="flex items-center flex-col mt-4">
              <Loading />
              <div className="mt-2">Analyzing resume...</div>
            </div>
          ) : (
            <AiResumeReviewResponseContent
              content={object}
              isStreaming={isLoading}
            />
          )}
        </SheetContent>
      </SheetPortal>
    </Sheet>
  );
};

export default AiResumeReviewSection;
