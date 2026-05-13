"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Download, Loader2 } from "lucide-react";

export default function DataExportSettings() {
  const { t } = useTranslations();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleExport = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch("/api/users/export");

      if (response.status === 429) {
        toast({
          variant: "destructive",
          title: t("settings.error"),
          description: t("settings.exportRateLimited"),
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      // Download the ZIP file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ?? "jobsync-export.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        variant: "success",
        title: t("settings.exportTitle"),
        description: t("settings.exportSuccess"),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.error"),
        description: t("settings.exportFailed"),
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="space-y-0.5">
        <h4 className="text-sm font-medium">{t("settings.exportTitle")}</h4>
        <p className="text-sm text-muted-foreground">
          {t("settings.exportDesc")}
        </p>
      </div>
      <Button
        variant="outline"
        onClick={handleExport}
        disabled={isDownloading}
        className="gap-2"
      >
        {isDownloading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            {t("settings.exportDownloading")}
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            {t("settings.exportButton")}
          </>
        )}
      </Button>
    </div>
  );
}
