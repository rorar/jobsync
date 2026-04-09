"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n";
import { formatDateShort } from "@/i18n";
import { euresJobDetailUrl } from "@/lib/eu-portal-urls";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import {
  Check,
  X,
  ExternalLink,
  Briefcase,
  Building2,
  MapPin,
  Loader2,
} from "lucide-react";
import type { DiscoveredJob } from "@/models/automation.model";
import { acceptDiscoveredJob, dismissDiscoveredJob } from "@/actions/automation.actions";

interface DiscoveredJobsListProps {
  jobs: DiscoveredJob[];
  onRefresh: () => void;
  onViewDetails?: (job: DiscoveredJob) => void;
}

export function DiscoveredJobsList({
  jobs,
  onRefresh,
  onViewDetails,
}: DiscoveredJobsListProps) {
  const { t, locale } = useTranslations();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAccept = async (jobId: string) => {
    setLoadingAction(jobId);
    const result = await acceptDiscoveredJob(jobId);
    setLoadingAction(null);

    if (result.success) {
      toast({ title: t("automations.jobAccepted"), description: t("automations.jobAcceptedDesc") });
      onRefresh();
    } else {
      toast({
        title: t("automations.somethingWentWrong"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleDismiss = async (jobId: string) => {
    setLoadingAction(jobId);
    const result = await dismissDiscoveredJob(jobId);
    setLoadingAction(null);

    if (result.success) {
      toast({ title: t("automations.jobDismissed") });
      onRefresh();
    } else {
      toast({
        title: t("automations.somethingWentWrong"),
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 65) return "secondary";
    return "outline";
  };

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{t("automations.noDiscoveredJobs")}</h3>
          <p className="text-muted-foreground text-center mt-2">
            {t("automations.noDiscoveredJobsDesc")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("automations.discoveredJobs")}</CardTitle>
        <CardDescription>
          {t("automations.discoveredJobsDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("automations.job")}</TableHead>
              <TableHead>{t("automations.company")}</TableHead>
              <TableHead>{t("automations.locationHeader")}</TableHead>
              <TableHead className="text-center">{t("automations.match")}</TableHead>
              <TableHead>{t("automations.status")}</TableHead>
              <TableHead>{t("automations.discovered")}</TableHead>
              <TableHead className="text-right">{t("automations.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const isLoading = loadingAction === job.id;
              const jobTitle = job.title ?? "—";
              const companyName = job.employerName ?? "—";
              const locationName = job.location ?? null;
              const sourceUrl = job.sourceUrl ? euresJobDetailUrl(job.sourceUrl, locale) : null;

              const jobContext = companyName !== "—" ? `${jobTitle} — ${companyName}` : jobTitle;
              const viewDetailsLabel = t("automations.discoveredJob.viewDetailsAria").replace(
                "{job}",
                jobContext,
              );
              const externalLinkLabel = t("automations.discoveredJob.externalLinkAria").replace(
                "{job}",
                jobContext,
              );
              const acceptLabel = t("automations.discoveredJob.acceptAria").replace(
                "{job}",
                jobContext,
              );
              const dismissLabel = t("automations.discoveredJob.dismissAria").replace(
                "{job}",
                jobContext,
              );

              return (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {/*
                       * H-Y-05: Native <button> replaces the keyboard-orphaned
                       * <span onClick>. Unstyled classes preserve the visual
                       * (no background, no border) so the job title still reads
                       * as body text, but keyboard users can tab to it and
                       * activate it with Enter or Space.
                       */}
                      <button
                        type="button"
                        className="text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm bg-transparent border-0 p-0 cursor-pointer"
                        onClick={() => onViewDetails?.(job)}
                        aria-label={viewDetailsLabel}
                      >
                        {jobTitle}
                      </button>
                      {sourceUrl && (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                          aria-label={externalLinkLabel}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {companyName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {locationName || "N/A"}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {job.matchScore != null ? (
                      <Badge variant={getScoreBadgeVariant(job.matchScore)}>
                        {job.matchScore}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        job.status === "ready"
                          ? "default"
                          : job.status === "dismissed"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {job.discoveredAt ? formatDateShort(new Date(job.discoveredAt), locale) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {job.status === "staged" && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAccept(job.id)}
                          disabled={isLoading}
                          aria-label={acceptLabel}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDismiss(job.id)}
                          disabled={isLoading}
                          aria-label={dismissLabel}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          ) : (
                            <X className="h-4 w-4" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
