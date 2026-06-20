"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ContactPicker, type PersonOption } from "@/components/crm/ContactPicker";
import { CompanyPicker, type CompanyOption } from "@/components/crm/CompanyPicker";
import type { ReferralKind } from "@/models/insideTrack.model";

// ---------------------------------------------------------------------------
// TipCaptureForm
//
// Design SoT: docs/design/inside-track-ui.md §G item 4 + §H
//   - fieldset+legend for kind (RadioGroup, not tabs)
//   - optional fields labelled "(optional)"
//   - conditional insider field REMOVED from DOM (not CSS-hidden) when
//     insider_relay; reveal announced via role=status aria-live region
//   - Shadcn Form* error pattern for tipsterRequired validation
//   - kind defaults to insider_relay
// ---------------------------------------------------------------------------

export interface TipCaptureFormData {
  kind: ReferralKind;
  tipsterId: string;
  insiderId?: string;
  targetCompanyId?: string;
}

interface TipCaptureFormProps {
  persons: PersonOption[];
  loadingPersons?: boolean;
  companies?: CompanyOption[];
  loadingCompanies?: boolean;
  onSubmit: (data: TipCaptureFormData) => void | Promise<void>;
  onCancel?: () => void;
}

export function TipCaptureForm({
  persons,
  loadingPersons,
  companies = [],
  loadingCompanies,
  onSubmit,
  onCancel,
}: TipCaptureFormProps) {
  const { t } = useTranslations();

  const [kind, setKind] = useState<ReferralKind>("insider_relay");
  const [tipsterId, setTipsterId] = useState("");
  const [insiderId, setInsiderId] = useState("");
  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [tipsterError, setTipsterError] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // When kind changes, announce the reveal/hide of conditional fields
  // and clear the insider selection (it becomes irrelevant on insider_relay).
  function handleKindChange(value: string) {
    const next = value as ReferralKind;
    setKind(next);
    setInsiderId("");
    if (next === "network_path") {
      setAnnouncement(t("insideTrack.tipCapture.networkPathFieldsAppeared"));
    } else {
      setAnnouncement(t("insideTrack.tipCapture.insiderRelayFieldsAppeared"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate tipster (required)
    if (!tipsterId) {
      setTipsterError(true);
      return;
    }
    setTipsterError(false);

    const data: TipCaptureFormData = {
      kind,
      tipsterId,
      ...(kind === "network_path" && insiderId ? { insiderId } : {}),
      ...(targetCompanyId ? { targetCompanyId } : {}),
    };

    setSubmitting(true);
    try {
      await onSubmit(data);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* ---- Kind — fieldset+legend RadioGroup (§G item 4) ---- */}
      <fieldset className="mb-4">
        <legend className="text-sm font-medium mb-2">{t("insideTrack.tipCapture.kindLabel")}</legend>
        <RadioGroup
          value={kind}
          onValueChange={handleKindChange}
          className="flex flex-col gap-2"
        >
          {/* insider_relay option */}
          <div className="flex items-start gap-2">
            <RadioGroupItem value="insider_relay" id="kind-insider-relay" className="mt-0.5" />
            <div>
              <Label htmlFor="kind-insider-relay" className="font-normal cursor-pointer">
                {t("insideTrack.kind.insider_relay")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("insideTrack.tipCapture.kindHint.insider_relay")}
              </p>
            </div>
          </div>
          {/* network_path option */}
          <div className="flex items-start gap-2">
            <RadioGroupItem value="network_path" id="kind-network-path" className="mt-0.5" />
            <div>
              <Label htmlFor="kind-network-path" className="font-normal cursor-pointer">
                {t("insideTrack.kind.network_path")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("insideTrack.tipCapture.kindHint.network_path")}
              </p>
            </div>
          </div>
        </RadioGroup>
      </fieldset>

      {/* ---- Aria-live region for conditional field reveal (§G item 4) ---- */}
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </span>

      {/* ---- Tipster — required ---- */}
      <div className="mb-4">
        <Label htmlFor="tipster-picker" className="mb-1.5 block text-sm font-medium">
          {t("insideTrack.tipCapture.tipsterLabel")}{" "}
          <span aria-hidden="true">*</span>
        </Label>
        <ContactPicker
          value={tipsterId}
          onValueChange={(id) => {
            setTipsterId(id);
            if (id) setTipsterError(false);
          }}
          persons={persons}
          loading={loadingPersons}
          placeholderKey="insideTrack.tipCapture.tipsterPlaceholder"
          ariaLabelKey="insideTrack.tipCapture.tipsterLabel"
        />
        {tipsterError && (
          <p
            id="tipster-error"
            role="alert"
            className="mt-1 text-sm text-destructive"
          >
            {t("insideTrack.tipCapture.tipsterRequired")}
          </p>
        )}
      </div>

      {/* ---- Insider — conditional (only in DOM for network_path) ---- */}
      {kind === "network_path" && (
        <div className="mb-4">
          <Label htmlFor="insider-picker" className="mb-1.5 block text-sm font-medium">
            {t("insideTrack.tipCapture.insiderLabel")}{" "}
            <span className="text-muted-foreground font-normal">
              {t("insideTrack.tipCapture.optionalSuffix")}
            </span>
          </Label>
          <ContactPicker
            value={insiderId}
            onValueChange={setInsiderId}
            persons={persons}
            loading={loadingPersons}
            placeholderKey="insideTrack.tipCapture.insiderPlaceholder"
            ariaLabelKey="insideTrack.tipCapture.insiderLabel"
          />
        </div>
      )}

      {/* ---- Target company — optional; enables CommitToApply -> reify Job ---- */}
      <div className="mb-4">
        <Label htmlFor="company-picker" className="mb-1.5 block text-sm font-medium">
          {t("insideTrack.tipCapture.companyLabel")}{" "}
          <span className="text-muted-foreground font-normal">
            {t("insideTrack.tipCapture.optionalSuffix")}
          </span>
        </Label>
        <CompanyPicker
          value={targetCompanyId}
          onValueChange={setTargetCompanyId}
          companies={companies}
          loading={loadingCompanies}
        />
      </div>

      {/* ---- Actions ---- */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            {t("insideTrack.tipCapture.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {t("insideTrack.tipCapture.submit")}
        </Button>
      </div>
    </form>
  );
}
