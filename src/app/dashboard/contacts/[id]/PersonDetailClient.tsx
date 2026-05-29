"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, formatDateShort } from "@/i18n";
import { useToast } from "@/components/ui/use-toast";
import { getPerson, updatePerson, archivePerson, reactivatePerson, anonymizePerson } from "@/actions/person.actions";
import { getPersonHolidayInfo, type PersonHolidayInfo } from "@/actions/reference-data.actions";
import { getInterviews } from "@/actions/crmInterview.actions";
import { getCrmTasks } from "@/actions/crmTask.actions";
import { getCrmNotes } from "@/actions/crmNote.actions";
import { getJobContactsForPerson, removeJobContact } from "@/actions/jobContact.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Archive, RefreshCw, ShieldOff, Mail, Phone, MapPin, Briefcase, ExternalLink, Pencil, Trash2, CalendarDays, Sun } from "lucide-react";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import PersonForm from "@/components/crm/PersonForm";
import type { TypedEmail, TypedPhone, CompanyAssociation, SocialProfile } from "@/models/person.model";

interface PersonDetailClientProps {
  personId: string;
}

const statusVariant = (status: string) => {
  switch (status) {
    case "active": return "default" as const;
    case "archived": return "secondary" as const;
    case "anonymized": return "destructive" as const;
    default: return "outline" as const;
  }
};

export default function PersonDetailClient({ personId }: PersonDetailClientProps) {
  const { t, locale } = useTranslations();
  const { toast } = useToast();
  const router = useRouter();
  const [person, setPerson] = useState<Record<string, unknown> | null>(null);
  const [interviews, setInterviews] = useState<Record<string, unknown>[]>([]);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [notes, setNotes] = useState<Record<string, unknown>[]>([]);
  const [jobContacts, setJobContacts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [holidayInfo, setHolidayInfo] = useState<PersonHolidayInfo | null>(null);

  const loadPerson = useCallback(async () => {
    setLoading(true);
    const result = await getPerson(personId);
    if (result.success && result.data) {
      setPerson(result.data as Record<string, unknown>);
    }
    setLoading(false);
  }, [personId]);

  const loadRelated = useCallback(async () => {
    const [intResult, taskResult, noteResult, jcResult] = await Promise.all([
      getInterviews({ personId }),
      getCrmTasks({ targetPersonId: personId }),
      getCrmNotes({ targetPersonId: personId }),
      getJobContactsForPerson(personId),
    ]);
    if (intResult.success && intResult.data) setInterviews(intResult.data as Record<string, unknown>[]);
    if (taskResult.success && taskResult.data) setTasks(taskResult.data as Record<string, unknown>[]);
    if (noteResult.success && noteResult.data) setNotes(noteResult.data as Record<string, unknown>[]);
    if (jcResult.success && jcResult.data) setJobContacts(jcResult.data as Record<string, unknown>[]);
  }, [personId]);

  useEffect(() => {
    loadPerson();
    loadRelated();
  }, [loadPerson, loadRelated]);

  // Holiday PoC: fetch holiday info when person data is available.
  // Guarded against stale writes — a slower earlier request must not overwrite
  // the result of a newer one (or write after unmount).
  useEffect(() => {
    const cc = person?.addressCountryCode as string | undefined;
    if (!cc) { setHolidayInfo(null); return; }
    const sub = (person?.addressSubdivisionCode as string | undefined) ?? undefined;
    let cancelled = false;
    getPersonHolidayInfo(cc, locale, sub)
      .then((info) => { if (!cancelled) setHolidayInfo(info); })
      .catch(() => { if (!cancelled) setHolidayInfo(null); });
    return () => { cancelled = true; };
  }, [person?.addressCountryCode, person?.addressSubdivisionCode, locale]);

  const handleArchive = async () => {
    const result = await archivePerson(personId);
    if (result.success) {
      toast({ title: t("crm.contactArchived") });
      loadPerson();
    } else {
      toast({ title: t(result.message ?? ""), variant: "destructive" });
    }
  };

  const handleReactivate = async () => {
    const result = await reactivatePerson(personId);
    if (result.success) {
      toast({ title: t("crm.contactReactivated") });
      loadPerson();
    } else {
      toast({ title: t(result.message ?? ""), variant: "destructive" });
    }
  };

  const handleAnonymize = async () => {
    const result = await anonymizePerson(personId);
    if (result.success) {
      toast({ title: t("crm.contactAnonymized") });
      loadPerson();
    } else {
      toast({ title: t(result.message ?? ""), variant: "destructive" });
    }
  };

  const handleUpdate = async (input: Record<string, unknown>) => {
    const result = await updatePerson(personId, input as unknown as Parameters<typeof updatePerson>[1]);
    if (result.success) {
      toast({ title: t("crm.contactUpdated") });
      setEditOpen(false);
      loadPerson();
    } else {
      toast({ title: t(result.message ?? ""), variant: "destructive" });
    }
  };

  const handleUnlinkJob = async (jobContactId: string) => {
    const result = await removeJobContact(jobContactId);
    if (result.success) {
      toast({ title: t("crm.jobUnlinked") });
      loadRelated();
    } else {
      toast({ title: t(result.message ?? ""), variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="p-4">
        <p>{t("crm.errors.personNotFound")}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/contacts")} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("crm.contacts")}
        </Button>
      </div>
    );
  }

  const emails = (person.emails as TypedEmail[]) ?? [];
  const phones = (person.phones as TypedPhone[]) ?? [];
  const status = person.status as string;
  const companies = (person.companies as CompanyAssociation[]) ?? [];

  return (
    <div className="col-span-3 space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" aria-label={t("crm.backToContacts")} onClick={() => router.push("/dashboard/contacts")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {[person.firstName, person.lastName].filter(Boolean).join(" ") || t("crm.contactDetails")}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={statusVariant(status)}>{t(`crm.status.${status}`)}</Badge>
              <Badge variant="outline">{t(`crm.dataSource.${person.dataSource}`)}</Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {status === "active" && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              {t("crm.editContact")}
            </Button>
          )}
          {status === "active" && (
            <Button variant="outline" size="sm" onClick={handleArchive}>
              <Archive className="mr-2 h-4 w-4" />
              {t("crm.archive")}
            </Button>
          )}
          {status === "archived" && (
            <Button variant="outline" size="sm" onClick={handleReactivate}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("crm.reactivate")}
            </Button>
          )}
          {status !== "anonymized" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <ShieldOff className="mr-2 h-4 w-4" />
                  {t("crm.anonymize")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("crm.anonymizeConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("crm.anonymizeConfirmDescription")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("crm.cancelInterview")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAnonymize}>{t("crm.anonymize")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("crm.tab.overview")}</TabsTrigger>
          <TabsTrigger value="interviews">{t("crm.tab.interviews")} ({interviews.length})</TabsTrigger>
          <TabsTrigger value="tasks">{t("crm.tab.tasks")} ({tasks.length})</TabsTrigger>
          <TabsTrigger value="notes">{t("crm.tab.notes")} ({notes.length})</TabsTrigger>
          <TabsTrigger value="jobs">{t("crm.tab.relatedJobs")} ({jobContacts.length})</TabsTrigger>
          <TabsTrigger value="timeline">{t("crm.tab.timeline")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contact Info */}
            <Card>
              <CardHeader><CardTitle>{t("crm.contactDetails")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {String(person.headline ?? "") && (
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span>{String(person.headline)}</span>
                  </div>
                )}
                {companies.map((c) => (
                  <div key={c.companyId ?? c.companyLabel} className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span>{c.companyLabel}</span>
                    {c.role && <span className="text-muted-foreground">— {c.role}</span>}
                    {c.isPrimary && <Badge className="text-xs">{t("crm.primary")}</Badge>}
                  </div>
                ))}
                {Array.isArray(person.socialProfiles) && (person.socialProfiles as SocialProfile[]).map((sp) => (
                  <div key={`${sp.platform}-${sp.url}`} className="flex items-center gap-2 text-sm">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <a href={sp.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {t(`crm.platform.${sp.platform}` as any)}
                    </a>
                  </div>
                ))}
                {(String(person.addressCity ?? "") || String(person.addressCountry ?? "")) && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{[person.addressCity, person.addressSubdivisionCode, person.addressCountry].filter(Boolean).map(String).join(", ")}</span>
                  </div>
                )}
                {holidayInfo && (
                  <div className="flex items-center gap-2 text-sm">
                    {holidayInfo.isHoliday ? (
                      <>
                        <CalendarDays className="h-4 w-4 text-amber-500" />
                        <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600">
                          {t("crm.holidayToday").replace("{country}", holidayInfo.countryName).replace("{name}", holidayInfo.holidayName ?? "")}
                        </Badge>
                      </>
                    ) : holidayInfo.isWeekend ? (
                      <>
                        <Sun className="h-4 w-4 text-blue-500" />
                        <Badge variant="outline" className="text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-600">
                          {t("crm.weekendToday").replace("{country}", holidayInfo.countryName)}
                        </Badge>
                      </>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Emails & Phones */}
            <Card>
              <CardHeader><CardTitle>{t("crm.email")} & {t("crm.phone")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {emails.map((e) => (
                  <div key={e.email} className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{e.email}</span>
                    <Badge variant="outline" className="text-xs">{t(`crm.channelType.${e.type}`)}</Badge>
                    {e.isPrimary && <Badge className="text-xs">{t("crm.primaryEmail")}</Badge>}
                  </div>
                ))}
                {phones.map((p) => (
                  <div key={p.number} className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{p.number}</span>
                    <Badge variant="outline" className="text-xs">{t(`crm.channelType.${p.type}`)}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* GDPR Info */}
            <Card>
              <CardHeader><CardTitle>{t("crm.gdpr")}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("crm.processingBasis")}</span>
                  <span>{t(`crm.processingBasis.${person.processingBasis}`)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("crm.dataSourceLabel")}</span>
                  <span>{t(`crm.dataSource.${person.dataSource}`)}</span>
                </div>
                {Boolean(person.retentionExpiresAt) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("crm.retentionExpires")}</span>
                    <span>{formatDateShort(new Date(person.retentionExpiresAt as string), locale)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="interviews">
          {interviews.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t("crm.noInterviews")}</p>
          ) : (
            <div className="space-y-3">
              {interviews.map((interview) => (
                <Card key={interview.id as string}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{String(((interview.job as Record<string, unknown>)?.JobTitle as Record<string, unknown>)?.label ?? "")}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateShort(new Date(interview.interviewDate as string), locale)} {String(interview.location ?? "") && `- ${String(interview.location)}`}
                      </p>
                    </div>
                    <Badge variant={interview.status === "completed" ? "outline" : interview.status === "cancelled" ? "destructive" : "default"}>
                      {t(`crm.interviewStatus.${interview.status}`)}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks">
          {tasks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t("crm.noTasks")}</p>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <Card key={task.id as string}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{task.title as string}</p>
                      {Boolean(task.dueDate) && (
                        <p className="text-sm text-muted-foreground">
                          {t("crm.dueDate")}: {formatDateShort(new Date(task.dueDate as string), locale)}
                        </p>
                      )}
                    </div>
                    <Badge variant={task.status === "done" ? "outline" : task.status === "cancelled" ? "destructive" : "default"}>
                      {t(`crm.taskStatus.${task.status}`)}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes">
          {notes.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t("crm.noNotes")}</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <Card key={note.id as string}>
                  <CardContent className="p-4">
                    {String(note.title ?? "") && <p className="font-medium">{String(note.title)}</p>}
                    <p className="text-sm text-muted-foreground">{note.body as string}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDateShort(new Date(note.createdAt as string), locale)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs">
          {jobContacts.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">{t("crm.noRelatedJobs")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("crm.noRelatedJobsDescription")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobContacts.map((jc) => {
                const job = jc.job as Record<string, unknown>;
                const jobTitle = (job?.JobTitle as Record<string, unknown>)?.label as string ?? "";
                const company = (job?.Company as Record<string, unknown>)?.label as string ?? "";
                const status = (job?.Status as Record<string, unknown>)?.value as string ?? "";
                const statusLabel = (job?.Status as Record<string, unknown>)?.label as string ?? status;
                return (
                  <Card key={jc.id as string}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{jobTitle}</p>
                        <p className="text-sm text-muted-foreground truncate">{company}</p>
                        {Boolean(jc.role) && (
                          <p className="text-xs text-muted-foreground mt-1">{t("crm.contactRole")}: {String(jc.role)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <Badge variant="outline">{statusLabel}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={t("crm.openJob")}
                          onClick={() => {
                            const id = job?.id as string;
                            if (id) router.push(`/dashboard/myjobs/${id}`);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={t("crm.unlinkJob")}
                          onClick={() => handleUnlinkJob(jc.id as string)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          <ActivityTimeline targetPersonId={personId} />
        </TabsContent>
      </Tabs>

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("crm.editContact")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <PersonForm
              person={person}
              onSubmit={handleUpdate}
              onCancel={() => setEditOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
