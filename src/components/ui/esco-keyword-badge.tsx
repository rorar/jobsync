"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ESCO_URI_PREFIX = "http://data.europa.eu/esco/";

interface EscoKeywordBadgeProps {
  keyword: string;
  className?: string;
}

/**
 * Renders a keyword as a Badge. When the keyword is an ESCO occupation URI,
 * fetches the occupation title and code from the ESCO details API and displays
 * them instead of the raw URI. Free-text keywords are displayed as-is.
 */
export function EscoKeywordBadge({ keyword, className }: EscoKeywordBadgeProps) {
  const isEscoUri = keyword.startsWith(ESCO_URI_PREFIX);
  const [label, setLabel] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isEscoUri || fetchedRef.current) return;
    fetchedRef.current = true;

    fetch(`/api/esco/details?uri=${encodeURIComponent(keyword)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.title) {
          setLabel(data.code ? `${data.title} (${data.code})` : data.title);
        } else {
          // Fallback: extract last segment from URI
          const segments = keyword.split("/");
          setLabel(segments[segments.length - 1] ?? keyword);
        }
      })
      .catch(() => {
        const segments = keyword.split("/");
        setLabel(segments[segments.length - 1] ?? keyword);
      });
  }, [keyword, isEscoUri]);

  if (!isEscoUri) {
    return (
      <Badge variant="secondary" className={cn("text-xs", className)}>
        {keyword}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={cn("text-xs gap-1", className)}>
      <Briefcase className="h-3 w-3 shrink-0" />
      {label ?? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />}
    </Badge>
  );
}

/**
 * Check if a keyword string is an ESCO occupation URI.
 */
export function isEscoUri(keyword: string): boolean {
  return keyword.startsWith(ESCO_URI_PREFIX);
}
