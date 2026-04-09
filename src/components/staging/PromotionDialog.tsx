"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { promoteStagedVacancyToJob } from "@/actions/stagedVacancy.actions";
import { toast } from "@/components/ui/use-toast";
import { useTranslations } from "@/i18n";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

/**
 * Shape surfaced to `onSuccess` after a successful promotion. Mirrors the
 * `data` payload of `promoteStagedVacancyToJob`'s `ActionResult`. The jobId
 * is THREADED through to `useDeckStack.performAction` so the super-like
 * celebration fly-in can link to the newly created Job (ADR-030 Decision A).
 *
 * Keeping the full shape (jobId + stagedVacancyId) — not just jobId — so
 * future callers can disambiguate which staged vacancy was just promoted
 * without re-reading component state.
 */
export interface PromotionDialogSuccessResult {
  jobId: string;
  stagedVacancyId: string;
}

interface PromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vacancy: StagedVacancyWithAutomation | null;
  /**
   * Fired after the server action returns success. Receives the created
   * Job's id so callers can forward it into the deck state machine
   * (see `StagingContainer.promotionResolveRef`) and downstream celebration
   * hooks. ADR-030 Decision A — contract is additive: the shape mirrors the
   * server action's `ActionResult<{ jobId, stagedVacancyId }>.data` payload.
   */
  onSuccess: (result: PromotionDialogSuccessResult) => void;
}

export function PromotionDialog({
  open,
  onOpenChange,
  vacancy,
  onSuccess,
}: PromotionDialogProps) {
  const { t } = useTranslations();
  const [submitting, setSubmitting] = useState(false);
  const [titleOverride, setTitleOverride] = useState("");
  const [companyOverride, setCompanyOverride] = useState("");
  const [locationOverride, setLocationOverride] = useState("");
  // TODO: Replace text input with Tag multi-select component (like AddJob's tag selector)

  // Reset form when vacancy changes
  const resetForm = () => {
    setTitleOverride(vacancy?.title ?? "");
    setCompanyOverride(vacancy?.employerName ?? "");
    setLocationOverride(vacancy?.location ?? "");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && vacancy) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const handlePromote = async () => {
    if (!vacancy) return;

    setSubmitting(true);
    try {
      const result = await promoteStagedVacancyToJob({
        stagedVacancyId: vacancy.id,
        jobTitleOverride: titleOverride || undefined,
        companyOverride: companyOverride || undefined,
        locationOverride: locationOverride || undefined,
      });

      if (result.success && result.data) {
        toast({
          variant: "success",
          description: t("staging.promoted"),
        });
        onOpenChange(false);
        // Thread the created Job id through to the caller so the deck state
        // machine can forward it to `onSuperLikeSuccess` and the celebration
        // fly-in (ADR-030 Decision A). Before this fix, `onSuccess()` was
        // parameterless and the jobId was silently dropped — CRIT-A2.
        onSuccess({
          jobId: result.data.jobId,
          stagedVacancyId: result.data.stagedVacancyId,
        });
      } else if (result.success && !result.data) {
        // Defensive: the server action declared `ActionResult<{jobId,...}>`
        // but returned success without `data`. Surface a dev-only warning so
        // silent contract drift is visible in the console; still treat the
        // flow as successful for the user.
        console.warn(
          "[PromotionDialog] promoteStagedVacancyToJob returned success without data — cannot forward jobId",
          { stagedVacancyId: vacancy.id, result },
        );
        toast({
          variant: "success",
          description: t("staging.promoted"),
        });
        onOpenChange(false);
      } else {
        toast({
          variant: "destructive",
          title: t("staging.error"),
          description: result.message,
        });
      }
    } catch (error) {
      console.error("[PromotionDialog] Promotion failed:", error);
      toast({
        variant: "destructive",
        title: t("staging.error"),
        description: t("staging.promotionFailed"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("staging.promotionTitle")}</DialogTitle>
          <DialogDescription>
            {vacancy?.title}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title-override">{t("staging.titleOverride")}</Label>
            <Input
              id="title-override"
              value={titleOverride}
              onChange={(e) => setTitleOverride(e.target.value)}
              placeholder={vacancy?.title ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company-override">{t("staging.companyOverride")}</Label>
            <Input
              id="company-override"
              value={companyOverride}
              onChange={(e) => setCompanyOverride(e.target.value)}
              placeholder={vacancy?.employerName ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location-override">{t("staging.locationOverride")}</Label>
            <Input
              id="location-override"
              value={locationOverride}
              onChange={(e) => setLocationOverride(e.target.value)}
              placeholder={vacancy?.location ?? ""}
            />
          </div>
          {/* TODO: Replace text input with Tag multi-select component (like AddJob's tag selector) */}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handlePromote} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}
            {t("staging.promote")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
