"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "@/i18n";
import { getJobsList } from "@/actions/job.actions";
import { getPersons } from "@/actions/person.actions";
import { parseEmails } from "@/models/person.model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup,
} from "@/components/ui/command";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

type LocationMode = "online" | "onsite";

interface JobOption {
  id: string;
  label: string;
}

interface PersonOption {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseLocationMode(raw: string | undefined): {
  mode: LocationMode;
  videoLink: string;
  address: string;
  buildingRoom: string;
} {
  if (!raw) return { mode: "onsite", videoLink: "", address: "", buildingRoom: "" };

  if (raw.startsWith("online:")) {
    return { mode: "online", videoLink: raw.slice(7), address: "", buildingRoom: "" };
  }

  if (raw.startsWith("onsite:")) {
    const parts = raw.slice(7).split(" | ");
    return {
      mode: "onsite",
      videoLink: "",
      address: parts[0] ?? "",
      buildingRoom: parts[1] ?? "",
    };
  }

  // Legacy: plain string — treat as on-site address
  return { mode: "onsite", videoLink: "", address: raw, buildingRoom: "" };
}

function buildLocationString(
  mode: LocationMode,
  videoLink: string,
  address: string,
  buildingRoom: string,
): string | undefined {
  if (mode === "online") {
    return videoLink ? `online:${videoLink}` : undefined;
  }
  if (!address && !buildingRoom) return undefined;
  const base = `onsite:${address}`;
  return buildingRoom ? `${base} | ${buildingRoom}` : base;
}

function parseDateAndTime(isoOrLocal: string): { date: string; time: string } {
  if (!isoOrLocal) return { date: "", time: "" };
  try {
    const d = new Date(isoOrLocal);
    if (isNaN(d.getTime())) return { date: "", time: "" };
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
  } catch {
    return { date: "", time: "" };
  }
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

  // --- Job selector state ---
  const [jobId, setJobId] = useState(defaultValues?.jobId ?? "");
  const [jobOpen, setJobOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // --- Person selector state ---
  const [personId, setPersonId] = useState(defaultValues?.personId ?? "");
  const [personOpen, setPersonOpen] = useState(false);
  const [personSearch, setPersonSearch] = useState("");
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [personsLoading, setPersonsLoading] = useState(false);

  // --- Date/time state ---
  const { date: initDate, time: initTime } = parseDateAndTime(
    defaultValues?.interviewDate ?? "",
  );
  const [date, setDate] = useState(initDate);
  const [time, setTime] = useState(initTime);

  // --- Location state ---
  const parsedLoc = parseLocationMode(defaultValues?.location);
  const [locationMode, setLocationMode] = useState<LocationMode>(parsedLoc.mode);
  const [videoLink, setVideoLink] = useState(parsedLoc.videoLink);
  const [address, setAddress] = useState(parsedLoc.address);
  const [buildingRoom, setBuildingRoom] = useState(parsedLoc.buildingRoom);

  // --- Notes ---
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");

  // --- Load jobs on mount ---
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setJobsLoading(true);
      try {
        const result = await getJobsList(1, 200);
        if (!cancelled && result.success && result.data) {
          // Deduplicate by label — multiple Job records with the same
          // title+company (e.g. from different automation runs) should
          // appear as a single option. Keep the first job's ID.
          const seen = new Map<string, JobOption>();
          for (const j of result.data) {
            const raw = `${j.JobTitle.label} — ${j.Company.label}`;
            // Strip HTML entities (e.g. &nbsp;) that leak from job descriptions
            const label = raw.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
            if (!seen.has(label)) {
              seen.set(label, { id: j.id, label });
            }
          }
          setJobs(Array.from(seen.values()));
        }
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // --- Load persons on mount ---
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPersonsLoading(true);
      try {
        const result = await getPersons({ pageSize: 200 });
        if (!cancelled && result.success && result.data) {
          setPersons(
            result.data.persons.map((p) => {
              const firstName = (p.firstName as string) ?? "";
              const lastName = (p.lastName as string) ?? "";
              const emails = parseEmails(p.emails as string | null);
              const primaryEmail = emails.find((e) => e.isPrimary)?.email ?? emails[0]?.email ?? "";
              const emailSuffix = primaryEmail ? ` — ${primaryEmail}` : "";
              return {
                id: p.id as string,
                label: `${firstName} ${lastName}${emailSuffix}`.trim(),
              };
            }),
          );
        }
      } finally {
        if (!cancelled) setPersonsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // --- Derived ---
  const selectedJobLabel = jobs.find((j) => j.id === jobId)?.label ?? "";
  const selectedPersonLabel = persons.find((p) => p.id === personId)?.label ?? "";

  // --- Submit ---
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!jobId && !hideJobField) return;
    if (!date || !time) return;

    const interviewDate = new Date(`${date}T${time}`).toISOString();
    const location = buildLocationString(locationMode, videoLink, address, buildingRoom);

    onSubmit({
      jobId,
      interviewDate,
      location,
      notes: notes || undefined,
      personId: personId || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ----------------------------------------------------------------- */}
      {/* Job Selector                                                      */}
      {/* ----------------------------------------------------------------- */}
      {!hideJobField && (
        <div className="space-y-2">
          <Label>{t("crm.jobTitle")} <span className="text-destructive">*</span></Label>
          <Popover open={jobOpen} onOpenChange={setJobOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={jobOpen}
                className="w-full justify-between font-normal"
              >
                <span className="truncate">
                  {selectedJobLabel || t("crm.selectJob")}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder={t("crm.selectJob")}
                  value={jobSearch}
                  onValueChange={setJobSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    {jobsLoading ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      t("crm.noJobsFound")
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {jobs.map((job) => (
                      <CommandItem
                        key={job.id}
                        value={job.label}
                        onSelect={() => {
                          setJobId(job.id);
                          setJobOpen(false);
                          setJobSearch("");
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            jobId === job.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {job.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Date + Time                                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="if-date">
            {t("crm.interviewDate")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="if-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="if-time">
            {t("crm.interviewTime")} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="if-time"
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Location — Online / On-site toggle                                */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-3">
        <Label>{t("crm.interviewLocation")}</Label>
        <RadioGroup
          value={locationMode}
          onValueChange={(v) => setLocationMode(v as LocationMode)}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="online" id="loc-online" />
            <Label htmlFor="loc-online" className="font-normal cursor-pointer">
              {t("crm.locationOnline")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="onsite" id="loc-onsite" />
            <Label htmlFor="loc-onsite" className="font-normal cursor-pointer">
              {t("crm.locationOnsite")}
            </Label>
          </div>
        </RadioGroup>

        {locationMode === "online" ? (
          <div className="space-y-2">
            <Label htmlFor="if-video" className="text-sm font-normal text-muted-foreground">
              {t("crm.videoLink")}
            </Label>
            <Input
              id="if-video"
              type="url"
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
              placeholder="https://meet.google.com/..."
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="if-address" className="text-sm font-normal text-muted-foreground">
                {t("crm.addressLocation")}
              </Label>
              <Input
                id="if-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="if-building" className="text-sm font-normal text-muted-foreground">
                {t("crm.buildingRoom")}
              </Label>
              <Input
                id="if-building"
                value={buildingRoom}
                onChange={(e) => setBuildingRoom(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Person Selector                                                   */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-2">
        <Label>{t("crm.contacts")}</Label>
        <Popover open={personOpen} onOpenChange={setPersonOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={personOpen}
              className="w-full justify-between font-normal"
            >
              <span className="truncate">
                {selectedPersonLabel || t("crm.selectContact")}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput
                placeholder={t("crm.selectContact")}
                value={personSearch}
                onValueChange={setPersonSearch}
              />
              <CommandList>
                <CommandEmpty>
                  {personsLoading ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    t("crm.noContactsFound")
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {/* Clear selection option */}
                  {personId && (
                    <CommandItem
                      value="__clear__"
                      onSelect={() => {
                        setPersonId("");
                        setPersonOpen(false);
                        setPersonSearch("");
                      }}
                      className="text-muted-foreground"
                    >
                      <Check className="mr-2 h-4 w-4 opacity-0" />
                      —
                    </CommandItem>
                  )}
                  {persons.map((person) => (
                    <CommandItem
                      key={person.id}
                      value={person.label}
                      onSelect={() => {
                        setPersonId(person.id);
                        setPersonOpen(false);
                        setPersonSearch("");
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          personId === person.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {person.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Notes                                                             */}
      {/* ----------------------------------------------------------------- */}
      <div className="space-y-2">
        <Label htmlFor="if-notes">{t("crm.interviewNotes")}</Label>
        <Textarea
          id="if-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Submit                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("crm.scheduleInterview")}
        </Button>
      </div>
    </form>
  );
}
