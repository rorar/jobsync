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

interface PromotionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vacancy: StagedVacancyWithAutomation | null;
  onSuccess: () => void;
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
      const { success, message } = await promoteStagedVacancyToJob({
        stagedVacancyId: vacancy.id,
        jobTitleOverride: titleOverride || undefined,
        companyOverride: companyOverride || undefined,
        locationOverride: locationOverride || undefined,
      });

      if (success) {
        toast({
          variant: "success",
          description: t("staging.promoted"),
        });
        onOpenChange(false);
        onSuccess();
      } else {
        toast({
          variant: "destructive",
          title: t("staging.error"),
          description: message,
        });
      }
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
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("staging.promote")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
