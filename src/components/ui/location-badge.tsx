"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { getLocationLabel, getCountryCode } from "@/lib/connector/job-discovery/modules/eures/countries";

interface LocationBadgeProps {
  code: string;
  /** If true, resolve NUTS code to label via getLocationLabel. Default: true */
  resolve?: boolean;
  className?: string;
}

/**
 * Renders a location code as a Badge with country flag.
 * Resolves NUTS codes (de1 -> "DE1: Baden-Württemberg") and shows flag SVGs.
 */
export function LocationBadge({ code, resolve = true, className }: LocationBadgeProps) {
  const label = resolve ? getLocationLabel(code) : code;
  const countryCode = getCountryCode(code);

  return (
    <Badge variant="secondary" className={`text-xs gap-1 ${className ?? ""}`}>
      {countryCode && (
        <Image
          src={`/flags/${countryCode.toLowerCase()}.svg`}
          alt={countryCode}
          width={14}
          height={14}
          className="h-3.5 w-3.5"
        />
      )}
      {label}
    </Badge>
  );
}
