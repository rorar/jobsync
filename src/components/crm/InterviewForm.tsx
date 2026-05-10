"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterviewFormValues {
  jobId: string;
  interviewDate: string;
  location?: string;
  notes?: string;
  personId?: string;
}

interface InterviewFormProps {
  onSubmit: (values: InterviewFormValues) => void | Promise<void>;
  submitting?: boolean;
  defaultValues?: Partial<InterviewFormValues>;
  /** When true, the job selector is hidden (e.g. reschedule flow). */
  hideJobField?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InterviewForm({
  onSubmit,
  submitting = false,
  defaultValues,
  hideJobField = false,
}: InterviewFormProps) {
  const { t } = useTranslations();

  const [jobId, setJobId] = useState(defaultValues?.jobId ?? "");
  const [interviewDate, setInterviewDate] = useState(defaultValues?.interviewDate ?? "");
  const [location, setLocation] = useState(defaultValues?.location ?? "");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [personId, setPersonId] = useState(defaultValues?.personId ?? "");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!jobId && !hideJobField) return;
    if (!interviewDate) return;

    onSubmit({
      jobId,
      interviewDate: new Date(interviewDate).toISOString(),
      location: location || undefined,
      notes: notes || undefined,
      personId: personId || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Job ID (will be enhanced to a selector later) */}
      {!hideJobField && (
        <div className="space-y-2">
          <label htmlFor="if-jobId" className="text-sm font-medium">
            {t("crm.jobTitle")} <span className="text-destructive">*</span>
          </label>
          <Input
            id="if-jobId"
            required
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="Job ID"
          />
        </div>
      )}

      {/* Date/time */}
      <div className="space-y-2">
        <label htmlFor="if-date" className="text-sm font-medium">
          {t("crm.interviewDate")} <span className="text-destructive">*</span>
        </label>
        <Input
          id="if-date"
          type="datetime-local"
          required
          value={interviewDate}
          onChange={(e) => setInterviewDate(e.target.value)}
        />
      </div>

      {/* Location */}
      <div className="space-y-2">
        <label htmlFor="if-location" className="text-sm font-medium">
          {t("crm.interviewLocation")}
        </label>
        <Input
          id="if-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      {/* Person ID (optional, will be enhanced later) */}
      <div className="space-y-2">
        <label htmlFor="if-person" className="text-sm font-medium">
          {t("crm.contacts")}
        </label>
        <Input
          id="if-person"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          placeholder="Person ID"
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label htmlFor="if-notes" className="text-sm font-medium">
          {t("crm.interviewNotes")}
        </label>
        <Textarea
          id="if-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("crm.scheduleInterview")}
        </Button>
      </div>
    </form>
  );
}
