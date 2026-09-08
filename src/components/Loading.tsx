"use client";

import { Loader } from "lucide-react";
import { useTranslations } from "@/i18n";

const Loading = () => {
  const { t } = useTranslations();
  return (
    <div
      className="flex items-center justify-center"
      data-testid="loader"
      role="status"
    >
      <Loader
        className="animate-spin motion-reduce:animate-none text-blue-500"
        size={48}
        aria-hidden="true"
      />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
};

export default Loading;
