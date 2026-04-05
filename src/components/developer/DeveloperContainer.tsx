"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import {
  generateMockActivitiesAction,
  clearMockActivitiesAction,
  generateMockProfileDataAction,
  clearMockProfileDataAction,
  clearE2ETestDataAction,
} from "@/actions/mock.actions";
import { runRetentionCleanup } from "@/actions/stagedVacancy.actions";
import { useTranslations } from "@/i18n";
import { toast } from "@/components/ui/use-toast";

type StatusMessage = { type: "success" | "error"; text: string };

function StatusBanner({ message }: { message: StatusMessage }) {
  const { t } = useTranslations();

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 ${
        message.type === "error"
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          : "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
      }`}
    >
      {message.type === "error" ? (
        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
      ) : (
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        <p className="font-semibold">
          {message.type === "error" ? t("developer.error") : t("developer.success")}
        </p>
        <p className="text-sm">{message.text}</p>
      </div>
    </div>
  );
}

export function MockActivitiesCard() {
  const { t } = useTranslations();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setMessage(null);
    const result = await generateMockActivitiesAction();
    setMessage({
      type: result.success ? "success" : "error",
      text:
        result.message ||
        (result.success
          ? t("developer.mockActivitiesGenerated")
          : t("developer.mockActivitiesGenerateFailed")),
    });
    setIsGenerating(false);
  };

  const handleClear = async () => {
    setIsClearing(true);
    setMessage(null);
    const result = await clearMockActivitiesAction();
    setMessage({
      type: result.success ? "success" : "error",
      text:
        result.message ||
        (result.success
          ? t("developer.mockActivitiesCleared")
          : t("developer.mockActivitiesClearFailed")),
    });
    setIsClearing(false);
  };

  return (
    <div className="space-y-4">
      {message && <StatusBanner message={message} />}
      <Card>
        <CardHeader>
          <CardTitle>{t("developer.mockDataManagement")}</CardTitle>
          <CardDescription>
            {t("developer.mockDataDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">{t("developer.generateMockActivities")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("developer.generateMockActivitiesDesc")}
            </p>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || isClearing}
              className="w-full"
            >
              {isGenerating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isGenerating ? t("developer.generating") : t("developer.generateMockActivities")}
            </Button>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">{t("developer.clearMockActivities")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("developer.clearMockActivitiesDesc")}
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={isClearing || isGenerating}
                  variant="destructive"
                  className="w-full"
                >
                  {isClearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isClearing ? t("developer.clearing") : t("developer.clearMockActivities")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("developer.clearMockActivities")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("developer.confirmClearActivities")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClear}>
                    {t("developer.clearMockActivities")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ClearAllMockDataCard() {
  const { t } = useTranslations();
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const handleClearAll = async () => {
    setIsClearing(true);
    setMessage(null);

    const [activitiesResult, profileResult] = await Promise.all([
      clearMockActivitiesAction(),
      clearMockProfileDataAction(),
    ]);

    const allSuccess = activitiesResult.success && profileResult.success;
    const details = [activitiesResult.message, profileResult.message]
      .filter(Boolean)
      .join(" ");

    setMessage({
      type: allSuccess ? "success" : "error",
      text: allSuccess
        ? `${t("developer.allMockDataCleared")}. ${details}`
        : `${t("developer.allMockDataClearFailed")}. ${details}`,
    });
    setIsClearing(false);
  };

  return (
    <div className="space-y-4">
      {message && <StatusBanner message={message} />}
      <Card>
        <CardHeader>
          <CardTitle>{t("developer.clearAllMockData")}</CardTitle>
          <CardDescription>
            {t("developer.clearAllMockDataDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={isClearing}
                variant="destructive"
                className="w-full"
              >
                {isClearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isClearing ? t("developer.clearing") : t("developer.clearAllMockData")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("developer.clearAllMockData")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("developer.confirmClearAllMockData")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAll}>
                  {t("developer.clearAllMockData")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

export function ClearE2ETestDataCard() {
  const { t } = useTranslations();
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const handleClear = async () => {
    setIsClearing(true);
    setMessage(null);
    const result = await clearE2ETestDataAction();
    setMessage({
      type: result.success ? "success" : "error",
      text:
        result.message ||
        (result.success
          ? t("developer.e2eTestDataCleared")
          : t("developer.e2eTestDataClearFailed")),
    });
    setIsClearing(false);
  };

  return (
    <div className="space-y-4">
      {message && <StatusBanner message={message} />}
      <Card>
        <CardHeader>
          <CardTitle>{t("developer.clearE2ETestData")}</CardTitle>
          <CardDescription>
            {t("developer.clearE2ETestDataDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={isClearing}
                variant="destructive"
                className="w-full"
              >
                {isClearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isClearing ? t("developer.clearing") : t("developer.clearE2ETestData")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("developer.clearE2ETestData")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("developer.confirmClearE2ETestData")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleClear}>
                  {t("developer.clearE2ETestData")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

export function MockProfileCard() {
  const { t } = useTranslations();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setMessage(null);
    const result = await generateMockProfileDataAction();
    setMessage({
      type: result.success ? "success" : "error",
      text:
        result.message ||
        (result.success
          ? t("developer.mockProfileGenerated")
          : t("developer.mockProfileGenerateFailed")),
    });
    setIsGenerating(false);
  };

  const handleClear = async () => {
    setIsClearing(true);
    setMessage(null);
    const result = await clearMockProfileDataAction();
    setMessage({
      type: result.success ? "success" : "error",
      text:
        result.message ||
        (result.success
          ? t("developer.mockProfileCleared")
          : t("developer.mockProfileClearFailed")),
    });
    setIsClearing(false);
  };

  return (
    <div className="space-y-4">
      {message && <StatusBanner message={message} />}
      <Card>
        <CardHeader>
          <CardTitle>{t("developer.mockProfileData")}</CardTitle>
          <CardDescription>
            {t("developer.mockProfileDataDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">{t("developer.generateMockProfile")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("developer.generateMockProfileDesc")}
            </p>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || isClearing}
              className="w-full"
            >
              {isGenerating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isGenerating ? t("developer.generating") : t("developer.generateMockProfile")}
            </Button>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">{t("developer.clearMockProfile")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("developer.clearMockProfileDesc")}
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={isClearing || isGenerating}
                  variant="destructive"
                  className="w-full"
                >
                  {isClearing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isClearing ? t("developer.clearing") : t("developer.clearMockProfile")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("developer.clearMockProfile")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("developer.confirmClearProfile")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClear}>
                    {t("developer.clearMockProfile")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function RetentionCleanupCard() {
  const { t } = useTranslations();
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{
    purged: number;
    hashes: number;
    timestamp: Date;
  } | null>(null);

  const handleCleanup = async () => {
    setIsRunning(true);
    try {
      const result = await runRetentionCleanup();
      if (result.success && result.data) {
        const info = {
          purged: result.data.purgedCount,
          hashes: result.data.hashesCreated,
          timestamp: new Date(),
        };
        setLastResult(info);
        toast({
          variant: "success",
          title: t("developer.retentionCleanup"),
          description: t("developer.cleanupSuccess")
            .replace("{purged}", String(info.purged))
            .replace("{hashes}", String(info.hashes)),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("developer.retentionCleanup"),
          description: result.message || t("developer.error"),
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("developer.error"),
        description: t("developer.error"),
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("developer.retentionCleanup")}</CardTitle>
          <CardDescription>
            {t("developer.retentionCleanupDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastResult && (
            <p className="text-xs text-muted-foreground">
              {t("developer.lastCleanup")}:{" "}
              {lastResult.timestamp.toLocaleTimeString()} &mdash;{" "}
              {t("developer.cleanupSuccess")
                .replace("{purged}", String(lastResult.purged))
                .replace("{hashes}", String(lastResult.hashes))}
            </p>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full"
                disabled={isRunning}
                aria-label={t("developer.runCleanup")}
              >
                {isRunning ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {isRunning ? t("developer.cleanupRunning") : t("developer.runCleanup")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("developer.cleanupConfirm")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("developer.cleanupWarning")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleCleanup}>
                  {t("developer.runCleanup")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
