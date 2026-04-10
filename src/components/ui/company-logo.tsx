"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n";

const SIZE_MAP = {
  sm: { px: 24, text: "text-[10px]" },
  md: { px: 32, text: "text-xs" },
  lg: { px: 48, text: "text-sm" },
} as const;

interface CompanyLogoProps {
  logoUrl?: string | null;
  logoAssetId?: string | null;
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
 * Reusable company logo component with two-slot fallback.
 *
 * Priority:
 * 1. logoAssetId set -> `/api/logos/{id}` (local cached asset)
 * 2. On error + logoUrl exists -> external URL (fallback)
 * 3. Neither/both fail -> initials avatar
 *
 * States per slot:
 * - loading -> skeleton placeholder (pulse animation)
 * - loaded -> <img> display
 * - error -> try next slot or initials avatar
 */
export function CompanyLogo({
  logoUrl,
  logoAssetId,
  companyName,
  size = "md",
  className,
}: CompanyLogoProps) {
  const { t } = useTranslations();

  // Determine the effective src and whether there's a fallback
  const localSrc = logoAssetId ? `/api/logos/${logoAssetId}` : null;
  const externalSrc = logoUrl || null;
  const primarySrc = localSrc ?? externalSrc;
  const fallbackSrc = localSrc && externalSrc ? externalSrc : null;

  const [imageState, setImageState] = useState<
    "loading" | "loaded" | "error"
  >(primarySrc ? "loading" : "error");
  const [useFallback, setUseFallback] = useState(false);

  // L-P-04 (Sprint 4 Stream B) — state re-init guard.
  //
  // The previous effect re-ran on every `logoUrl` / `logoAssetId` reference
  // change, even when the *values* were shallow-equal. This happened whenever
  // the parent re-rendered with a fresh prop object (which `StagedVacancyCard`
  // does on every reload cycle — the vacancy array is replaced as a unit).
  // Resetting state on every parent re-render:
  //   1. forced the <img> back into skeleton state and re-ran the loader
  //      even though the URL was identical,
  //   2. flashed the pulse skeleton over a logo that was already painted,
  //   3. kept CompanyLogo out of the React.memo win bucket because its
  //      internal state kept churning.
  //
  // Fix (skill: "Dependencies point inward"): use a ref to capture the last
  // URL pair we actually reset for and only re-run the state reset when the
  // URL values (not references) change. String compare is safe because both
  // fields are string | null | undefined primitives. We deliberately do NOT
  // use `useMemo` on the URL tuple — that would require an extra render just
  // to settle, whereas the ref approach short-circuits inside the effect.
  const prevUrlsRef = useRef<{ logoUrl: string | null | undefined; logoAssetId: string | null | undefined }>({
    logoUrl,
    logoAssetId,
  });
  useEffect(() => {
    const prev = prevUrlsRef.current;
    if (prev.logoUrl === logoUrl && prev.logoAssetId === logoAssetId) {
      return;
    }
    prevUrlsRef.current = { logoUrl, logoAssetId };
    const src =
      (logoAssetId ? `/api/logos/${logoAssetId}` : null) ?? (logoUrl || null);
    setImageState(src ? "loading" : "error");
    setUseFallback(false);
  }, [logoUrl, logoAssetId]);

  const sizeConfig = SIZE_MAP[size];
  const initials = getInitials(companyName);

  const currentSrc = useFallback ? fallbackSrc : primarySrc;

  const handleLoad = useCallback(() => {
    setImageState("loaded");
  }, []);

  const handleError = useCallback(() => {
    // If primary failed and we have a fallback, try it
    if (!useFallback && fallbackSrc) {
      setUseFallback(true);
      setImageState("loading");
    } else {
      setImageState("error");
    }
  }, [useFallback, fallbackSrc]);

  const containerClasses = cn(
    "relative shrink-0 overflow-hidden rounded-md bg-muted",
    className,
  );

  const containerStyle = {
    width: sizeConfig.px,
    height: sizeConfig.px,
  };

  // No logo URL or image failed to load -> initials avatar
  if (!currentSrc || imageState === "error") {
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
        src={currentSrc}
        alt={companyName}
        width={sizeConfig.px}
        height={sizeConfig.px}
        className={cn(
          "aspect-square h-full w-full object-contain transition-opacity motion-reduce:transition-none",
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
