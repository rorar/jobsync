"use client";
import { useTranslations } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { addJob, updateJob, addJobToQueue } from "@/actions/job.actions";
import { Loader, PlusCircle } from "lucide-react";
import { Button } from "../ui/button";
import { useForm } from "react-hook-form";
import { useCallback, useEffect, useState, useTransition } from "react";
import { AddJobFormSchema } from "@/models/addJobForm.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Company,
  JOB_TYPES,
  JobLocation,
  JobResponse,
  JobSource,
  JobStatus,
  JobTitle,
  Tag,
} from "@/models/job.model";
import { SALARY_PERIODS, RELATIONSHIP_TYPES } from "@/models/job.model";
import { addDays } from "date-fns";
import { z } from "zod";
import { toast } from "../ui/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import SelectFormCtrl from "../Select";
import { DatePicker } from "../DatePicker";
import JobSalaryFields from "./JobSalaryFields";
import type { CurrencyOption } from "../ui/currency-select";
import { getCurrencyOptions } from "@/actions/reference-data.actions";
import { getJobFormSettings } from "@/actions/userSettings.actions";
import { parseBonus } from "@/lib/salary/bonus";
import TiptapEditor from "../TiptapEditor";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { redirect } from "next/navigation";
import { Combobox } from "../ComboBox";
import { NotesCollapsibleSection } from "./NotesCollapsibleSection";
import { Resume } from "@/models/profile.model";
import CreateResume from "../profile/CreateResume";
import { getResumeList } from "@/actions/profile.actions";
import { TagInput } from "./TagInput";
import { connectorRegistry } from "@/lib/connector/job-discovery/registry";
import { createJobTitle } from "@/actions/jobtitle.actions";
import { addCompany } from "@/actions/company.actions";
import { createLocation, createJobSource } from "@/actions/job.actions";
import {
  JobContactPicker,
  toPersonOption,
  type PersonOption,
} from "./JobContactPicker";
import { addJobContact } from "@/actions/jobContact.actions";
import { getPersons } from "@/actions/person.actions";
import type { CompanyAssociation, TypedEmail } from "@/models/person.model";

/** Display names for connector modules used as job sources */
const CONNECTOR_SOURCE_LABELS: Record<string, string> = {
  eures: "EURES",
  arbeitsagentur: "Arbeitsagentur",
  jsearch: "JSearch",
};

/**
 * Build the merged job source options list.
 * Connector module names are prepended so they always appear,
 * but duplicates (by matching value/label) are skipped.
 */
function mergeConnectorSources(dbSources: JobSource[]): JobSource[] {
  const existingValues = new Set(dbSources.map((s) => s.value.toLowerCase()));
  const connectorEntries: JobSource[] = connectorRegistry
    .availableConnectors()
    .filter((id) => !existingValues.has(id.toLowerCase()))
    .map((id) => ({
      id: `connector-${id}`,
      label: CONNECTOR_SOURCE_LABELS[id] ?? id,
      value: CONNECTOR_SOURCE_LABELS[id] ?? id,
      createdBy: "",
    }));
  return [...connectorEntries, ...dbSources];
}

type AddJobProps = {
  jobStatuses: JobStatus[];
  companies: Company[];
  jobTitles: JobTitle[];
  locations: JobLocation[];
  jobSources: JobSource[];
  tags: Tag[];
  editJob?: JobResponse | null;
  resetEditJob: () => void;
};

export function AddJob({
  jobStatuses,
  companies,
  jobTitles,
  locations,
  jobSources,
  tags,
  editJob,
  resetEditJob,
}: AddJobProps) {
  const { t, locale } = useTranslations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>(tags);
  const [isPending, startTransition] = useTransition();
  // Welle 2 Phase 3 — structured salary support
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(true);
  const [fixumDisablesRange, setFixumDisablesRange] = useState(true);
  // Welle 3 (F-AJ-07) — optional point-of-contact picker (create-only)
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [personsLoading, setPersonsLoading] = useState(false);
  const form = useForm<z.infer<typeof AddJobFormSchema>>({
    resolver: zodResolver(AddJobFormSchema) as any, // zod v4 + @hookform/resolvers type mismatch
    defaultValues: {
      title: "",
      company: "",
      location: "",
      source: "",
      type: Object.keys(JOB_TYPES)[0],
      dueDate: addDays(new Date(), 3),
      status: jobStatuses[0]?.id,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      salaryBonus: null,
      jobDescription: "",
      jobUrl: "",
      applied: false,
      resume: "",
      tags: [],
      sendToQueue: false,
      contactPersonId: "",
      contactRole: "",
      recruitingCompany: "",
      relationshipType: null,
    },
  });

  const { setValue, reset, watch, resetField } = form;

  const appliedValue = watch("applied");
  // Welle 3 (F-AJ-07): role is only meaningful once a contact person is chosen.
  const contactPersonIdValue = watch("contactPersonId");

  const loadResumes = useCallback(async () => {
    try {
      const resumes = await getResumeList();
      setResumes(resumes.data as any);
    } catch (error) {
      console.error("Failed to load resumes:", error);
    }
  }, [setResumes]);

  useEffect(() => {
    if (editJob) {
      reset(
        {
          id: editJob.id,
          userId: editJob.userId,
          title: editJob.JobTitle.id,
          company: editJob.Company.id,
          location: editJob.Location?.id ?? "",
          type: editJob.jobType,
          source: editJob.JobSource?.id ?? "",
          status: editJob.Status.id,
          dueDate: editJob.dueDate ?? undefined,
          salaryMin: editJob.salaryMin ?? null,
          salaryMax: editJob.salaryMax ?? null,
          salaryCurrency: editJob.salaryCurrency ?? null,
          salaryPeriod:
            SALARY_PERIODS.find((p) => p === editJob.salaryPeriod) ?? null,
          salaryBonus: parseBonus(editJob.salaryBonus ?? null),
          jobDescription: editJob.description,
          applied: editJob.applied,
          jobUrl: editJob.jobUrl ?? "",
          dateApplied: editJob.appliedDate ?? undefined,
          resume: editJob.Resume?.id ?? undefined,
          tags: editJob.tags?.map((t) => t.id) ?? [],
          // Welle 3 F-AJ-08: recruiter triangle prefill.
          recruitingCompany: editJob.RecruitingCompany?.id ?? "",
          relationshipType:
            (RELATIONSHIP_TYPES as readonly string[]).includes(
              editJob.relationshipType ?? "",
            )
              ? (editJob.relationshipType as (typeof RELATIONSHIP_TYPES)[number])
              : null,
        },
        { keepDefaultValues: true },
      );
      // Merge any tags from editJob into the local pool so they're selectable
      if (editJob.tags && editJob.tags.length > 0) {
        setAvailableTags((prev) => {
          const existing = new Set(prev.map((t) => t.id));
          const incoming = editJob.tags!.filter((t) => !existing.has(t.id));
          return incoming.length > 0 ? [...prev, ...incoming] : prev;
        });
      }
      setDialogOpen(true);
    }
  }, [editJob, reset]);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  // Load currency options + the fixum-disables-range setting for the salary section.
  useEffect(() => {
    let active = true;
    (async () => {
      setCurrenciesLoading(true);
      try {
        const [opts, jobFormSettings] = await Promise.all([
          getCurrencyOptions(locale),
          getJobFormSettings(),
        ]);
        if (!active) return;
        setCurrencies(opts);
        setFixumDisablesRange(jobFormSettings.fixumDisablesRange);
      } catch (error) {
        console.error("Failed to load salary settings:", error);
      } finally {
        if (active) setCurrenciesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [locale]);

  // Welle 3 (F-AJ-07): load persons for the point-of-contact picker (create-only).
  useEffect(() => {
    if (editJob) return;
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
              // getPersons (the Person repository) returns already-parsed value
              // objects for the JSON columns — no re-parse here.
              emails: p.emails as TypedEmail[] | null,
              companies: p.companies as CompanyAssociation[] | null,
              lastName: p.lastName as string | null,
            }),
          ),
        );
      } catch (error) {
        console.error("Failed to load contacts:", error);
      } finally {
        if (active) setPersonsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [editJob]);

  const setNewResumeId = (id: string) => {
    setTimeout(() => {
      setValue("resume", id);
    }, 500);
  };

  function onSubmit(data: z.infer<typeof AddJobFormSchema>) {
    startTransition(async () => {
      let result: { success: boolean; message?: string };
      let createdJobId: string | undefined;

      if (editJob) {
        result = await updateJob(data);
      } else if (data.sendToQueue) {
        result = await addJobToQueue(data);
      } else {
        const created = await addJob(data);
        result = created;
        if (created.success) createdJobId = created.data?.id;
      }

      if (!result.success) {
        toast({
          variant: "destructive",
          title: t("jobs.error"),
          description: t(result.message ?? "errors.unknown"),
        });
        return;
      }

      // Welle 3 (F-AJ-07): link the optional point of contact after the job is
      // created (Route A — Job aggregate write stays untouched). Non-blocking:
      // the job is already saved, so a link failure only warns, never rolls back.
      if (createdJobId && data.contactPersonId) {
        const linkResult = await addJobContact(
          createdJobId,
          data.contactPersonId,
          data.contactRole || null,
        );
        if (!linkResult.success) {
          toast({
            variant: "destructive",
            title: t("jobs.error"),
            description: t(linkResult.message ?? "errors.unknown"),
          });
        }
      }

      reset();
      setDialogOpen(false);
      toast({
        variant: "success",
        description: editJob ? t("jobs.updatedSuccess") : t("jobs.createdSuccess"),
      });
      redirect(data.sendToQueue && !editJob ? "/dashboard/staging" : "/dashboard/myjobs");
    });
  }

  const pageTitle = editJob ? t("jobs.editJob") : t("jobs.addJob");

  const addJobForm = () => {
    reset();
    resetEditJob();
    setDialogOpen(true);
  };

  const jobAppliedChange = (applied: boolean) => {
    if (applied) {
      form.getValues("status") === jobStatuses[0]?.id &&
        setValue("status", jobStatuses[1]?.id);
      setValue("dateApplied", new Date());
    } else {
      resetField("dateApplied");
      setValue("status", jobStatuses[0]?.id);
    }
  };

  const closeDialog = () => setDialogOpen(false);

  const createResume = () => {
    setResumeDialogOpen(true);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1"
        onClick={addJobForm}
        data-testid="add-job-btn"
      >
        <PlusCircle className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          {t("jobs.newJob")}
        </span>
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogOverlay>
          <DialogContent className="h-full xl:h-[85vh] lg:h-[95vh] lg:max-w-screen-lg lg:max-h-screen overflow-y-scroll">
            <DialogHeader>
              <DialogTitle data-testid="add-job-dialog-title">
                {pageTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {editJob ? t("jobs.editJob") : t("jobs.addJob")}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4"
              >
                {/* Job URL */}
                <div className="md:col-span-2">
                  <FormField
                    control={form.control}
                    name="jobUrl"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("jobs.jobUrl")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("jobs.copyJobLink")}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Job Title */}
                <div>
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("jobs.jobTitle")}</FormLabel>
                        <FormControl>
                          <Combobox
                            options={jobTitles}
                            field={field}
                            creatable
                            onCreateOption={async (label) => {
                              const res = await createJobTitle(label);
                              if (!res.success) {
                                toast({
                                  variant: "destructive",
                                  title: t("common.error"),
                                  description: t(res.message ?? "errors.unknown"),
                                });
                                return null;
                              }
                              return res.data as { id: string; label: string; value: string };
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Company */}
                <div>
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("jobs.company")}</FormLabel>
                        <FormControl>
                          <Combobox
                            options={companies}
                            field={field}
                            creatable
                            onCreateOption={async (label) => {
                              const res = await addCompany({ company: label });
                              if (!res.success) {
                                toast({
                                  variant: "destructive",
                                  title: t("common.error"),
                                  description: t(res.message ?? "errors.unknown"),
                                });
                                return null;
                              }
                              return res.data as { id: string; label: string; value: string };
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Location */}
                <div>
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("jobs.location")}</FormLabel>
                        <FormControl>
                          <Combobox
                            options={locations}
                            field={field}
                            creatable
                            onCreateOption={async (label) => {
                              const res = await createLocation(label);
                              if (!res.success) {
                                toast({
                                  variant: "destructive",
                                  title: t("common.error"),
                                  description: t(res.message ?? "errors.unknown"),
                                });
                                return null;
                              }
                              return res.data as { id: string; label: string; value: string };
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Job Type */}
                <div>
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="mb-2">{t("jobs.jobType")}</FormLabel>
                        <RadioGroup
                          name="type"
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex space-y-1"
                        >
                          {Object.entries(JOB_TYPES).map(([key, value]) => (
                            <FormItem
                              key={key}
                              className="flex items-center space-x-3 space-y-0"
                            >
                              <FormControl>
                                <RadioGroupItem value={key} />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {value}
                              </FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* Job Source */}
                <div>
                  <FormField
                    control={form.control}
                    name="source"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("jobs.jobSource")}</FormLabel>
                        <FormControl>
                        <Combobox
                          options={mergeConnectorSources(jobSources)}
                          field={field}
                          creatable
                          onCreateOption={async (label) => {
                            const res = await createJobSource(label);
                            if (!res.success) {
                              toast({
                                variant: "destructive",
                                title: t("common.error"),
                                description: t(res.message ?? "errors.unknown"),
                              });
                              return null;
                            }
                            return res.data as { id: string; label: string; value: string };
                          }}
                        />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Applied */}
                <div
                  className="flex items-center"
                  data-testid="switch-container"
                >
                  <FormField
                    control={form.control}
                    name="applied"
                    render={({ field }) => (
                      <FormItem className="flex flex-row">
                        <Switch
                          id="applied-switch"
                          checked={field.value ?? false}
                          onCheckedChange={(a) => {
                            field.onChange(a);
                            jobAppliedChange(a);
                          }}
                        />
                        <FormLabel
                          htmlFor="applied-switch"
                          className="flex items-center ml-4 mb-2"
                        >
                          {field.value ? t("jobs.applied") : t("jobs.notApplied")}
                        </FormLabel>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Send to Queue (only in create mode) */}
                {!editJob && (
                  <div
                    className="flex items-center"
                    data-testid="send-to-queue-container"
                  >
                    <FormField
                      control={form.control}
                      name="sendToQueue"
                      render={({ field }) => (
                        <FormItem className="flex flex-row">
                          <Switch
                            id="send-to-queue-switch"
                            checked={field.value ?? false}
                            onCheckedChange={field.onChange}
                          />
                          <div className="flex flex-col ml-4">
                            <FormLabel
                              htmlFor="send-to-queue-switch"
                              className="flex items-center mb-1"
                            >
                              {t("jobs.sendToQueue")}
                            </FormLabel>
                            <p className="text-xs text-muted-foreground">
                              {t("jobs.sendToQueueDescription")}
                            </p>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Status */}
                <div>
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem className="flex flex-col [&>button]:capitalize">
                        <FormLabel>{t("jobs.status")}</FormLabel>
                        <SelectFormCtrl
                          label="Job Status"
                          options={jobStatuses}
                          field={field}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Date Applied */}
                <div className="flex flex-col">
                  <FormField
                    control={form.control}
                    name="dateApplied"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("jobs.dateApplied")}</FormLabel>
                        <DatePicker
                          field={field}
                          presets={false}
                          isEnabled={appliedValue}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Due Date */}
                <div>
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("jobs.dueDate")}</FormLabel>
                        <DatePicker
                          field={field}
                          presets={true}
                          isEnabled={true}
                          allowClear={true}
                          triggerTestId="due-date-trigger"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Structured salary (Welle 2 Phase 3) */}
                <div>
                  <JobSalaryFields
                    key={editJob?.id ?? "new-job"}
                    form={form}
                    currencies={currencies}
                    currenciesLoading={currenciesLoading}
                    fixumDisablesRange={fixumDisablesRange}
                    initialFixum={
                      fixumDisablesRange &&
                      editJob?.salaryMin != null &&
                      editJob.salaryMin === editJob.salaryMax
                    }
                  />
                </div>

                {/* Resume */}
                <div className="flex items-end">
                  <FormField
                    control={form.control}
                    name="resume"
                    render={({ field }) => (
                      <FormItem className="flex flex-col [&>button]:capitalize">
                        <FormLabel>{t("jobs.resume")}</FormLabel>
                        <SelectFormCtrl
                          label="Resume"
                          options={resumes}
                          field={field}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button variant="link" type="button" onClick={createResume}>
                    {t("jobs.addNew")}
                  </Button>
                  <CreateResume
                    resumeDialogOpen={resumeDialogOpen}
                    setResumeDialogOpen={setResumeDialogOpen}
                    reloadResumes={loadResumes}
                    setNewResumeId={setNewResumeId}
                  />
                </div>

                {/* Recruiter triangle (Welle 3 F-AJ-08) — optional, create + edit */}
                <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="recruitingCompany"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("crm.recruitingCompany")}</FormLabel>
                        <FormControl>
                          <Combobox
                            options={companies}
                            field={field}
                            creatable
                            onCreateOption={async (label) => {
                              const res = await addCompany({ company: label });
                              if (!res.success) {
                                toast({
                                  variant: "destructive",
                                  title: t("common.error"),
                                  description: t(res.message ?? "errors.unknown"),
                                });
                                return null;
                              }
                              return res.data as { id: string; label: string; value: string };
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="relationshipType"
                    render={({ field }) => (
                      <FormItem className="flex flex-col [&>button]:capitalize">
                        <FormLabel>{t("crm.relationshipType")}</FormLabel>
                        <SelectFormCtrl
                          label={t("crm.relationshipType")}
                          options={RELATIONSHIP_TYPES.map((rt) => ({
                            id: rt,
                            label: t(`crm.relationship.${rt}`),
                            value: rt,
                          }))}
                          field={field}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Point of Contact (Welle 3 F-AJ-07) — optional, create-only */}
                {!editJob && (
                  <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="contactPersonId"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>{t("crm.pointOfContact")}</FormLabel>
                          <FormControl>
                            <JobContactPicker
                              value={field.value ?? ""}
                              onValueChange={(personId) => {
                                field.onChange(personId);
                                // Clearing the person clears any stale role.
                                if (!personId) setValue("contactRole", "");
                              }}
                              persons={persons}
                              loading={personsLoading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contactRole"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>{t("crm.contactRole")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              placeholder={t("crm.contactRolePlaceholder")}
                              disabled={!contactPersonIdValue}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {/* Add Skill Tags */}
                <div className="md:col-span-2">
                  <FormField
                    control={form.control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{t("jobs.addSkill")}</FormLabel>
                        <FormControl>
                          <TagInput
                            availableTags={availableTags}
                            selectedTagIds={field.value ?? []}
                            onChange={(ids) => field.onChange(ids)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Job Description */}
                <div className="md:col-span-2">
                  <FormField
                    control={form.control}
                    name="jobDescription"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel id="job-description-label">
                          {t("jobs.jobDescription")}
                        </FormLabel>
                        <FormControl>
                          <TiptapEditor field={field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {editJob && <NotesCollapsibleSection jobId={editJob.id} />}
                <div className="md:col-span-2">
                  <DialogFooter
                  // className="md:col-span
                  >
                    <div>
                      <Button
                        type="reset"
                        variant="outline"
                        className="mt-2 md:mt-0 w-full"
                        onClick={closeDialog}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                    <Button type="submit" data-testid="save-job-btn">
                      {t("common.save")}
                      {isPending && (
                        <Loader className="h-4 w-4 shrink-0 spinner" />
                      )}
                    </Button>
                  </DialogFooter>
                </div>
              </form>
            </Form>
          </DialogContent>
        </DialogOverlay>
      </Dialog>
    </>
  );
}
