"use client";

import { Paperclip } from "lucide-react";
import { toast } from "../ui/use-toast";
import { useTranslations } from "@/i18n";

interface DownloadFileButtonProps {
  fileName: string;
  fileTitle: string;
}

export function DownloadFileButton({
  fileName,
  fileTitle,
}: DownloadFileButtonProps) {
  const { t } = useTranslations();
  const handleDownload = async () => {
    try {
      // Use fileName (not filePath) to prevent server path leakage (SEC-11)
      const response = await fetch(
        `/api/profile/resume?filePath=${encodeURIComponent(fileName)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.target = "_blank";
        link.click();
        window.URL.revokeObjectURL(url);
      } else {
        toast({
          variant: "destructive",
          description: t("profile.downloadFailed"),
        });
      }
    } catch (error) {
      console.error("Download error:", error);
      toast({
        variant: "destructive",
        description: t("profile.downloadFailed"),
      });
    }
  };

  return (
    <button
      className="flex items-center"
      onClick={handleDownload}
      title={`Download ${fileName}`}
    >
      <div>{fileTitle}</div>
      <Paperclip className="h-3.5 w-3.5 ml-1" />
    </button>
  );
}
