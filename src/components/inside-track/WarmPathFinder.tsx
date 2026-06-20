"use client";

/**
 * WarmPathFinder — Welle 5 (Inside Track) Phase 5, Task 5.3
 *
 * Self-fetching panel. Given a target company, reveals 1-hop insiders
 * (direct contacts at the company) and 2-hop network paths (a contact
 * who knows an insider). Data is already sorted by the server action
 * (active before former; close > medium > weak). Do NOT re-sort here.
 *
 * SoT: specs/inside-track.allium surface WarmPathFinder
 * Design: docs/design/inside-track-ui.md §C + §G item 5
 * @guarantee ExcludesConsentBlockedPersons — enforced server-side in
 *   warmPath.actions.ts; this component just renders what it receives.
 */

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, interpolate } from "@/lib/utils";
import { Network, AlertCircle, ArrowRight } from "lucide-react";
import { findWarmPaths } from "@/actions/warmPath.actions";
import type {
  WarmPathInsider,
  WarmPathNetwork,
} from "@/actions/warmPath.actions";

// ---------------------------------------------------------------------------
// Prop types
// ---------------------------------------------------------------------------

export interface WarmPathFinderProps {
  companyId: string;
  companyName: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

type Status = "loading" | "error" | "empty" | "results";

// ---------------------------------------------------------------------------
// Sub-components (kept inline per task guidance; can be extracted later)
// ---------------------------------------------------------------------------

/**
 * One insider row: name + optional position + "former" badge + sr-only sentence.
 */
function WarmPathInsiderRow({
  insider,
  companyName,
  formerLabel,
  directPathTemplate,
}: {
  insider: WarmPathInsider;
  companyName: string;
  formerLabel: string;
  directPathTemplate: string;
}) {
  const srText = interpolate(directPathTemplate, {
    insider: insider.name,
    company: companyName,
  });

  return (
    <li className="flex items-start gap-2 py-1.5">
      {/* Visible content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm">{insider.name}</span>
          {insider.isFormer && (
            <Badge variant="outline" className="text-xs">
              {formerLabel}
            </Badge>
          )}
        </div>
        {insider.position && (
          <p className="text-xs text-muted-foreground truncate">
            {insider.position}
          </p>
        )}
      </div>
      {/* Screen-reader-only relationship sentence (§G item 5) */}
      <span className="sr-only">{srText}</span>
    </li>
  );
}

/**
 * One network-path row: intermediary → insider with kind + strength labels.
 * Visual arrow separator is aria-hidden. sr-only pathDescription sentence.
 */
function WarmPathNetworkRow({
  path,
  companyName,
  kindLabel,
  strengthLabel,
  pathTemplate,
}: {
  path: WarmPathNetwork;
  companyName: string;
  kindLabel: string;
  strengthLabel: string;
  pathTemplate: string;
}) {
  const srText = interpolate(pathTemplate, {
    via: path.intermediaryName,
    insider: path.insiderName,
    company: companyName,
  });

  return (
    <li className="py-1.5">
      {/* sr-only full relationship sentence first so it's read in context */}
      <span className="sr-only">{srText}</span>

      {/* Visual representation — aria-hidden portions */}
      <div className="flex items-center gap-1.5 flex-wrap" aria-hidden="true">
        <span className="font-medium text-sm">{path.intermediaryName}</span>
        <ArrowRight
          className="h-3.5 w-3.5 text-muted-foreground shrink-0"
          aria-hidden="true"
        />
        <span className="font-medium text-sm">{path.insiderName}</span>
      </div>

      {/* Kind + strength badges */}
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        <Badge variant="secondary" className="text-xs">
          {kindLabel}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {strengthLabel}
        </Badge>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WarmPathFinder({
  companyId,
  companyName,
  className,
}: WarmPathFinderProps) {
  const { t } = useTranslations();

  // Component is a no-op when there's no company to query.
  if (!companyId) return null;

  return (
    <WarmPathFinderInner
      companyId={companyId}
      companyName={companyName}
      className={className}
      t={t}
    />
  );
}

/**
 * Inner component: receives pre-checked companyId + the translation function.
 * Separated to keep the hook rules clean (no early return before hooks).
 */
function WarmPathFinderInner({
  companyId,
  companyName,
  className,
  t,
}: WarmPathFinderProps & { t: (key: string) => string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [insiders, setInsiders] = useState<WarmPathInsider[]>([]);
  const [networkPaths, setNetworkPaths] = useState<WarmPathNetwork[]>([]);
  // Live-region text (role=status, polite, sr-only) — updated after fetch.
  const [liveText, setLiveText] = useState<string>("");
  // Stale-check: ignore results for an old companyId if a new one was set.
  const fetchIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const fetchId = ++fetchIdRef.current;

    setStatus("loading");
    setLiveText("");

    findWarmPaths(companyId).then((result) => {
      if (cancelled || fetchId !== fetchIdRef.current) return;

      if (!result.success || !result.data) {
        setStatus("error");
        return;
      }

      const { insiders: ins, networkPaths: net } = result.data;
      if (ins.length === 0 && net.length === 0) {
        setInsiders([]);
        setNetworkPaths([]);
        setStatus("empty");
        // Announce: no paths found — use the region label (distinct from the visible title)
        setLiveText(t("insideTrack.warmPath.emptyRegionLabel"));
      } else {
        setInsiders(ins);
        setNetworkPaths(net);
        setStatus("results");
        // Announce: count of paths found
        const total = ins.length + net.length;
        setLiveText(
          interpolate(t("insideTrack.warmPath.resultsFound"), {
            count: String(total),
            company: companyName,
          }),
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [companyId, companyName]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Panel title (always visible when not loading)
  // -------------------------------------------------------------------------
  const panelTitle = interpolate(t("insideTrack.warmPath.panelTitle"), {
    company: companyName,
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className={cn("space-y-3", className)}>
      {/* ----------------------------------------------------------------- */}
      {/* Loading                                                             */}
      {/* ----------------------------------------------------------------- */}
      {status === "loading" && (
        <Skeleton label={t("insideTrack.warmPath.loadingPaths")}>
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-2"
              >
                <div className="h-4 w-32 bg-muted rounded animate-pulse motion-reduce:animate-none" />
                <div className="h-4 w-20 bg-muted rounded animate-pulse motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </Skeleton>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Polite live region for loading→empty→results transitions           */}
      {/* Only rendered after a fetch completes (status != loading) so it    */}
      {/* does not collide with the Skeleton's own role="status".            */}
      {/* ----------------------------------------------------------------- */}
      {status !== "loading" && (
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {liveText}
        </span>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Error                                                               */}
      {/* ----------------------------------------------------------------- */}
      {status === "error" && (
        <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("insideTrack.warmPath.loadError")}</span>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Empty (both arrays empty)                                           */}
      {/* ----------------------------------------------------------------- */}
      {status === "empty" && (
        <div
          role="region"
          aria-label={t("insideTrack.warmPath.emptyRegionLabel")}
          className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground"
        >
          <Network className="h-6 w-6 mb-1" aria-hidden="true" />
          <p className="font-medium">
            {t("insideTrack.warmPath.empty.title")}
          </p>
          <p>{t("insideTrack.warmPath.empty.description")}</p>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Results                                                             */}
      {/* ----------------------------------------------------------------- */}
      {status === "results" && (
        <div className="space-y-4">
          {/* Panel heading */}
          <h3 className="text-sm font-semibold">{panelTitle}</h3>

          {/* ── Insiders section ── */}
          {insiders.length > 0 && (
            <section aria-label={t("insideTrack.warmPath.insidersListLabel")}>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {t("insideTrack.warmPath.sectionInsiders")}
              </h4>
              <ul aria-label={t("insideTrack.warmPath.insidersListLabel")}>
                {insiders.map((insider) => (
                  <WarmPathInsiderRow
                    key={insider.personId}
                    insider={insider}
                    companyName={companyName}
                    formerLabel={t("insideTrack.warmPath.formerBadge")}
                    directPathTemplate={t("insideTrack.warmPath.directPath")}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* ── Network paths section ── */}
          {networkPaths.length > 0 && (
            <section aria-label={t("insideTrack.warmPath.pathsListLabel")}>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {t("insideTrack.warmPath.sectionNetwork")}
              </h4>
              <ul aria-label={t("insideTrack.warmPath.pathsListLabel")}>
                {networkPaths.map((path) => (
                  <WarmPathNetworkRow
                    key={path.connectionId}
                    path={path}
                    companyName={companyName}
                    kindLabel={t(
                      `insideTrack.connectionKind.${path.kind}`,
                    )}
                    strengthLabel={t(
                      `insideTrack.connectionStrength.${path.strength}`,
                    )}
                    pathTemplate={t("insideTrack.warmPath.pathDescription")}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
