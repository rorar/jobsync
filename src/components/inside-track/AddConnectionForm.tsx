"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactPicker, type PersonOption } from "@/components/crm/ContactPicker";
import { CONNECTION_KINDS, CONNECTION_STRENGTHS } from "@/models/insideTrack.model";

// ---------------------------------------------------------------------------
// AddConnectionForm
//
// Design SoT: docs/design/inside-track-ui.md §B (AddConnectionForm component),
//   surface TipCapture (specs/inside-track.allium rule AddPersonConnection).
//
// Props:
//   - persons:       ContactPicker options (pre-loaded, from person.actions getPersons)
//   - fromPersonId:  The "from" end of the directed edge (the current contact's id).
//                    Used to pre-label the form ("Alice Smith knows…") if desired
//                    by a wrapping consumer; not validated here (the action enforces
//                    ownership and NoSelfConnection at the server boundary).
//   - onSubmit:      Called with { toPersonId, kind, strength } on valid submission.
//   - onCancel:      Called when the user presses cancel.
//
// DEVIATIONS: See TipCaptureSheet for full deviation doc. This form has no
//   deviations — it exposes the 6 kinds + 3 strengths from the model as-is.
// ---------------------------------------------------------------------------

export interface AddConnectionFormData {
  toPersonId: string;
  kind: string;
  strength: string;
}

interface AddConnectionFormProps {
  persons: PersonOption[];
  fromPersonId: string;
  onSubmit: (data: AddConnectionFormData) => void | Promise<void>;
  onCancel?: () => void;
}

export function AddConnectionForm({
  persons,
  fromPersonId: _fromPersonId, // available to parent for display; not used in this minimal form
  onSubmit,
  onCancel,
}: AddConnectionFormProps) {
  const { t } = useTranslations();

  const [toPersonId, setToPersonId] = useState("");
  const [kind, setKind] = useState("");
  const [strength, setStrength] = useState("");
  const [toPersonError, setToPersonError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!toPersonId) {
      setToPersonError(true);
      return;
    }
    setToPersonError(false);

    const data: AddConnectionFormData = {
      toPersonId,
      kind: kind || CONNECTION_KINDS[0],
      strength: strength || CONNECTION_STRENGTHS[0],
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
      {/* ---- "to" person — required ContactPicker ---- */}
      <div className="mb-4">
        <Label htmlFor="to-person-picker" className="mb-1.5 block text-sm font-medium">
          {t("insideTrack.addConnection.toLabel")}{" "}
          <span aria-hidden="true">*</span>
        </Label>
        <ContactPicker
          value={toPersonId}
          onValueChange={(id) => {
            setToPersonId(id);
            if (id) setToPersonError(false);
          }}
          persons={persons}
          placeholderKey="insideTrack.addConnection.personPlaceholder"
          ariaLabelKey="insideTrack.addConnection.toLabel"
        />
        {toPersonError && (
          <p
            id="to-person-error"
            role="alert"
            className="mt-1 text-sm text-destructive"
          >
            {t("insideTrack.addConnection.toPersonRequired")}
          </p>
        )}
      </div>

      {/* ---- kind — Shadcn Select, all 6 CONNECTION_KINDS ---- */}
      <div className="mb-4">
        <Label
          htmlFor="connection-kind-trigger"
          id="connection-kind-label"
          className="mb-1.5 block text-sm font-medium"
        >
          {t("insideTrack.addConnection.kindLabel")}
        </Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger
            id="connection-kind-trigger"
            aria-labelledby="connection-kind-label"
            className="w-full"
          >
            <SelectValue placeholder={t("insideTrack.addConnection.kindLabel")} />
          </SelectTrigger>
          <SelectContent>
            {CONNECTION_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`insideTrack.connectionKind.${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ---- strength — Shadcn Select, all 3 CONNECTION_STRENGTHS ---- */}
      <div className="mb-4">
        <Label
          htmlFor="connection-strength-trigger"
          id="connection-strength-label"
          className="mb-1.5 block text-sm font-medium"
        >
          {t("insideTrack.addConnection.strengthLabel")}
        </Label>
        <Select value={strength} onValueChange={setStrength}>
          <SelectTrigger
            id="connection-strength-trigger"
            aria-labelledby="connection-strength-label"
            className="w-full"
          >
            <SelectValue placeholder={t("insideTrack.addConnection.strengthLabel")} />
          </SelectTrigger>
          <SelectContent>
            {CONNECTION_STRENGTHS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`insideTrack.connectionStrength.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ---- Actions ---- */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            {t("insideTrack.addConnection.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {t("insideTrack.addConnection.submit")}
        </Button>
      </div>
    </form>
  );
}
