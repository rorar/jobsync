"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n";

const SIZE_MAP = {
  sm: { px: 24, text: "text-[10px]" },
  md: { px: 32, text: "text-xs" },
  lg: { px: 48, text: "text-sm" },
} as const;

interface CompanyLogoProps {
  logoUrl?: string | null;
  companyName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Extracts initials from a company name (first 2 characters, uppercase).
 * Tries first letters of first two words; falls back to first 2 chars.
 */
function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";

  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

/**
 * Reusable company logo component with fallback states.
 *
 * States:
 * 1. logoUrl exists and loading -> skeleton placeholder (pulse animation)
 * 2. logoUrl exists and loaded -> <img> display
 * 3. logoUrl null/undefined -> initials avatar
 * 4. Image load error -> initials avatar (graceful degradation)
 */
export function CompanyLogo({
  logoUrl,
  companyName,
  size = "md",
  className,
}: CompanyLogoProps) {
  const { t } = useTranslations();
  const [imageState, setImageState] = useState<
    "loading" | "loaded" | "error"
  >(logoUrl ? "loading" : "error");

  // Reset imageState when logoUrl prop changes (e.g., after enrichment writeback)
  useEffect(() => {
    setImageState(logoUrl ? "loading" : "error");
  }, [logoUrl]);

  const sizeConfig = SIZE_MAP[size];
  const initials = getInitials(companyName);

  const handleLoad = useCallback(() => {
    setImageState("loaded");
  }, []);

  const handleError = useCallback(() => {
    setImageState("error");
  }, []);

  const containerClasses = cn(
    "relative shrink-0 overflow-hidden rounded-md bg-muted",
    className,
  );

  const containerStyle = {
    width: sizeConfig.px,
    height: sizeConfig.px,
  };

  // No logo URL or image failed to load -> initials avatar
  if (!logoUrl || imageState === "error") {
    return (
      <div
        className={cn(
          containerClasses,
          "flex items-center justify-center",
        )}
        style={containerStyle}
        role="img"
        aria-label={companyName || t("enrichment.noLogo")}
      >
        <span
          className={cn(
            sizeConfig.text,
            "font-medium leading-none text-muted-foreground select-none",
          )}
        >
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div
      className={containerClasses}
      style={containerStyle}
    >
      {/* Skeleton while loading */}
      {imageState === "loading" && (
        <div
          className="absolute inset-0 animate-pulse bg-muted motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}

      {/* Actual image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt={companyName}
        width={sizeConfig.px}
        height={sizeConfig.px}
        className={cn(
          "aspect-square h-full w-full object-cover transition-opacity motion-reduce:transition-none",
          imageState === "loaded" ? "opacity-100" : "opacity-0",
        )}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
