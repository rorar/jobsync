"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "@/i18n";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/use-toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TipCaptureForm, type TipCaptureFormData } from "./TipCaptureForm";
import { toPersonOption, type PersonOption } from "@/components/crm/ContactPicker";
import type { CompanyOption } from "@/components/crm/CompanyPicker";
import { getPersons } from "@/actions/person.actions";
import { getAllCompanies } from "@/actions/company.actions";
import { recordInsiderTip, recordNetworkTip } from "@/actions/referral.actions";
import type { CompanyAssociation, TypedEmail } from "@/models/person.model";

// ---------------------------------------------------------------------------
// TipCaptureSheet
//
// Design SoT: docs/design/inside-track-ui.md §A + §B (TipCaptureSheet)
//
// Behaviour:
//   - Right sheet on desktop (min-width: 640px), bottom sheet on mobile.
//     Mirrors StagedVacancyDetailSheet (same useMediaQuery pattern).
//   - On open, fetches getPersons → PersonOption[] (mirrors AddJob §F-AJ-07).
//     pageSize=200 is the established CRM convention.
//   - Renders TipCaptureForm; on submit:
//       kind=insider_relay → recordInsiderTip({ tipsterId })
//       kind=network_path  → recordNetworkTip({ tipsterId, insiderId? })
//   - On success: toast insideTrack.toast.tipRecorded + call onRecorded + close.
//   - On action error: toast the result.message via t().
//
// DEVIATIONS (declared):
//   1. targetCompany is a SELECT-EXISTING company picker (getAllCompanies). Inline
//      company creation (the AddJob create-on-type flow) is a deliberate follow-up;
//      a tip can also stay a pure market tip (target_company = null).
//   2. `via` omitted: recordNetworkTip.viaId is NOT passed. Selecting the
//      PersonConnection that must satisfy invariant NetworkPathViaConnectsTipsterToInsider
//      is follow-up work (requires a connection picker that validates the
//      tipster→insider edge). Documented in specs/inside-track.allium as an
//      open question.
// ---------------------------------------------------------------------------

interface TipCaptureSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded?: () => void;
}

export function TipCaptureSheet({
  open,
  onOpenChange,
  onRecorded,
}: TipCaptureSheetProps) {
  const { t } = useTranslations();
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [personsLoading, setPersonsLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const side = isDesktop ? "right" : "bottom";

  // Load persons when the sheet is opened (mirrors AddJob §F-AJ-07 pattern).
  useEffect(() => {
    if (!open) return;
    let active = true;

    (async () => {
      setPersonsLoading(true);
      try {
        const result = await getPersons({ pageSize: 200 });
        if (!active || !result.success || !result.data) return;
        setPersons(
          result.data.persons.map((p) =>
            toPersonOption({
              id: p.id as string,
              firstName: p.firstName as string | null,
              lastName: p.lastName as string | null,
              emails: p.emails as TypedEmail[] | null,
              companies: p.companies as CompanyAssociation[] | null,
            }),
          ),
        );
      } catch (err) {
        console.error("[TipCaptureSheet] Failed to load persons:", err);
      } finally {
        if (active) setPersonsLoading(false);
      }
    })();

    (async () => {
      setCompaniesLoading(true);
      try {
        const result = await getAllCompanies();
        if (!active || !result.success || !result.data) return;
        setCompanies(result.data.map((c) => ({ id: c.id, label: c.label })));
      } catch (err) {
        console.error("[TipCaptureSheet] Failed to load companies:", err);
      } finally {
        if (active) setCompaniesLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [open]);

  async function handleSubmit(data: TipCaptureFormData) {
    startTransition(async () => {
      let result: { success: boolean; message?: string };

      if (data.kind === "insider_relay") {
        result = await recordInsiderTip({
          tipsterId: data.tipsterId,
          targetCompanyId: data.targetCompanyId ?? null,
        });
      } else {
        result = await recordNetworkTip({
          tipsterId: data.tipsterId,
          insiderId: data.insiderId ?? undefined,
          targetCompanyId: data.targetCompanyId ?? null,
          // viaId: omitted — DEVIATION 2 (see file doc)
        });
      }

      if (!result.success) {
        toast({
          variant: "destructive",
          title: t("insideTrack.toast.tipRecorded"),
          description: t(result.message ?? "errors.unknown"),
        });
        return;
      }

      toast({
        variant: "success",
        description: t("insideTrack.toast.tipRecorded"),
      });
      onRecorded?.();
      onOpenChange(false);
    });
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={
          side === "right"
            ? "flex flex-col gap-0 p-0 w-full sm:max-w-md h-full"
            : "flex flex-col gap-0 p-0 inset-x-0 bottom-0 h-[80vh] rounded-t-xl"
        }
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle>{t("insideTrack.tipCapture.title")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("insideTrack.tipCapture.title")}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5">
            <TipCaptureForm
              persons={persons}
              loadingPersons={personsLoading || isPending}
              companies={companies}
              loadingCompanies={companiesLoading}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
