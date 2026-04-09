"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n";
import { euresJobDetailUrl } from "@/lib/eu-portal-urls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/use-toast";
import {
  Building2,
  MapPin,
  ExternalLink,
  Check,
  X,
  Loader2,
} from "lucide-react";
import type { DiscoveredJob } from "@/models/automation.model";
import type { JobMatchResponse } from "@/models/ai.schemas";
import { acceptDiscoveredJob, dismissDiscoveredJob } from "@/actions/automation.actions";
import { MatchDetails } from "./MatchDetails";

interface DiscoveredJobDetailProps {
  job: DiscoveredJob | null;
  matchData: JobMatchResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}

export function DiscoveredJobDetail({
  job,
  matchData,
  open,
  onOpenChange,
  onRefresh,
}: DiscoveredJobDetailProps) {
  const [loadingAction, setLoadingAction] = useState<"accept" | "dismiss" | null>(null);
  const { t, locale } = useTranslations();

  if (!job) return null;

  const jobUrl = job.sourceUrl ? euresJobDetailUrl(job.sourceUrl, locale) : null;

  // H-Y-04: external-link anchor requires an accessible name. Compose it
  // from the job title + employer so screen reader users know where the
  // link lands ("Open job 'Software Engineer' at Acme in new tab").
  const jobContextForAria =
    job.employerName && job.title
      ? `${job.title} — ${job.employerName}`
      : job.title ?? t("automations.discoveredJob.notAvailable");
  const externalLinkAria = t(
    "automations.discoveredJob.externalLinkAria",
  ).replace("{job}", jobContextForAria);

  // Map the raw status enum to a translated label. Falls back to the raw
  // status string if the key is missing (e.g. during a future enum drift),
  // so users never see an empty badge.
  const statusLabel = (() => {
    if (!job.status) return "";
    const key = `automations.discoveredJob.status.${job.status}`;
    const translated = t(key);
    return translated === key ? job.status : translated;
  })();

  const handleAccept = async () => {
    setLoadingAction("accept");
    const result = await acceptDiscoveredJob(job.id);
    setLoadingAction(null);

    if (result.success) {
      toast({
        title: t("automations.discoveredJob.acceptedTitle"),
        description: t("automations.discoveredJob.acceptedDescription"),
      });
      onOpenChange(false);
      onRefresh();
    } else {
      toast({
        title: t("automations.discoveredJob.errorTitle"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleDismiss = async () => {
    setLoadingAction("dismiss");
    const result = await dismissDiscoveredJob(job.id);
    setLoadingAction(null);

    if (result.success) {
      toast({ title: t("automations.discoveredJob.dismissedTitle") });
      onOpenChange(false);
      onRefresh();
    } else {
      toast({
        title: t("automations.discoveredJob.errorTitle"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {job.title}
            {jobUrl && (
              <a
                href={jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                aria-label={externalLinkAria}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Building2 className="h-4 w-4" />
              {job.employerName ?? t("automations.discoveredJob.notAvailable")}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {job.location ?? t("automations.discoveredJob.notAvailable")}
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            <div className="flex items-center gap-4">
              <Badge variant="default" className="text-lg px-3 py-1">
                {job.matchScore}% {t("automations.discoveredJob.matchSuffix")}
              </Badge>
              <Badge variant="outline">{statusLabel}</Badge>
              {job.automation && (
                <span className="text-sm text-muted-foreground">
                  {t("automations.discoveredJob.fromAutomation")} {job.automation.name}
                </span>
              )}
            </div>

            <div>
              <h4 className="font-medium mb-2">
                {t("automations.discoveredJob.descriptionHeading")}
              </h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {job.description}
              </p>
            </div>

            <MatchDetails matchData={matchData} discoveredAt={job.discoveredAt ?? undefined} />
          </div>
        </ScrollArea>

        {job.status === "staged" && (
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleDismiss}
              disabled={loadingAction !== null}
            >
              {loadingAction === "dismiss" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" />
              ) : (
                <X className="h-4 w-4 mr-2" />
              )}
              {t("automations.discoveredJob.dismissButton")}
            </Button>
            <Button onClick={handleAccept} disabled={loadingAction !== null}>
              {loadingAction === "accept" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {t("automations.discoveredJob.acceptButton")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
