"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Briefcase,
  Eye,
  ExternalLink,
  Loader2,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n";
import { escoOccupationUrl, escoIscoGroupUrl, euresSearchUrl } from "@/lib/eu-portal-urls";

const ESCO_URI_PREFIX = "http://data.europa.eu/esco/";

interface EscoKeywordBadgeProps {
  keyword: string;
  className?: string;
}

interface EscoDetails {
  title: string;
  code?: string;
  description?: string;
  broaderIscoGroup?: { uri: string; code: string; title: string };
  escoUrl?: string;
  euresSearchUrl?: string;
}

/**
 * Detail popover for an ESCO occupation URI.
 * Shows title, ISCO code, description, group info, and portal links.
 */
function OccupationDetailPopover({ uri }: { uri: string }) {
  const { t, locale } = useTranslations();
  const [details, setDetails] = useState<EscoDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    setIsLoading(true);
    fetch(`/api/esco/details?uri=${encodeURIComponent(uri)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.title) setDetails(data);
      })
      .catch(() => {
        fetchedRef.current = false;
      })
      .finally(() => setIsLoading(false));
  }, [open, uri]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          aria-label="Details"
        >
          <Eye className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(320px,calc(100vw-2rem))] p-0"
        side="bottom"
        align="end"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground" />
          </div>
        )}
        {details && (
          <div className="p-3 space-y-3">
            <div>
              <h4 className="font-semibold text-sm">{details.title}</h4>
              {details.code && (
                <span className="text-xs text-muted-foreground">
                  ISCO {details.code}
                </span>
              )}
            </div>
            {details.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {details.description.length > 300
                  ? details.description.slice(0, 300) + "..."
                  : details.description}
              </p>
            )}
            {details.broaderIscoGroup && (
              <div className="flex items-center gap-1.5 text-xs">
                <Network className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">{t("automations.iscoGroup")}</span>
                <a
                  href={escoIscoGroupUrl(details.broaderIscoGroup.uri, locale)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {details.broaderIscoGroup.code} — {details.broaderIscoGroup.title}
                </a>
              </div>
            )}
            <div className="flex gap-2 pt-1 border-t">
              <a
                href={escoOccupationUrl(uri, locale, details.title)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Briefcase className="h-3 w-3" />
                {t("automations.escoPortal")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              <a
                href={euresSearchUrl(details.title, locale)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("automations.euresJobs")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
        )}
        {!isLoading && !details && (
          <p className="p-3 text-xs text-muted-foreground">
            {t("automations.couldNotLoad")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Renders a keyword as a Badge. When the keyword is an ESCO occupation URI,
 * fetches the occupation title and code from the ESCO details API and displays
 * them with an eye icon for detail preview. Free-text keywords displayed as-is.
 */
export function EscoKeywordBadge({ keyword, className }: EscoKeywordBadgeProps) {
  const isEsco = keyword.startsWith(ESCO_URI_PREFIX);
  const [label, setLabel] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isEsco || fetchedRef.current) return;
    fetchedRef.current = true;

    fetch(`/api/esco/details?uri=${encodeURIComponent(keyword)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.title) {
          setLabel(data.code ? `${data.title} (${data.code})` : data.title);
        } else {
          const segments = keyword.split("/");
          setLabel(segments[segments.length - 1] ?? keyword);
        }
      })
      .catch(() => {
        const segments = keyword.split("/");
        setLabel(segments[segments.length - 1] ?? keyword);
      });
  }, [keyword, isEsco]);

  if (!isEsco) {
    return (
      <Badge variant="secondary" className={cn("text-xs", className)}>
        {keyword}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={cn("text-xs gap-1 pr-1", className)}>
      <Briefcase className="h-3 w-3 shrink-0" />
      {label ?? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />}
      <OccupationDetailPopover uri={keyword} />
    </Badge>
  );
}

/**
 * Check if a keyword string is an ESCO occupation URI.
 */
export function isEscoUri(keyword: string): boolean {
  return keyword.startsWith(ESCO_URI_PREFIX);
}
