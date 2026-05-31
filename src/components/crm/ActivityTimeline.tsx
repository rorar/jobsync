"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "@/i18n";
import { getActivityTimeline } from "@/actions/crmActivityLog.actions";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRightLeft, FileText, CheckSquare, Calendar,
  UserPlus, UserCog, Mail, MailOpen, Phone, Paperclip,
  Bell, Send, FileCheck, Activity as ActivityIcon,
} from "lucide-react";
import type { ActivityType } from "@/models/person.model";

interface ActivityTimelineProps {
  targetPersonId?: string;
  targetJobId?: string;
}

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  status_changed: ArrowRightLeft,
  note_added: FileText,
  task_created: CheckSquare,
  task_completed: CheckSquare,
  interview_scheduled: Calendar,
  interview_completed: Calendar,
  contact_created: UserPlus,
  contact_updated: UserCog,
  email_sent: Mail,
  email_received: MailOpen,
  call_logged: Phone,
  document_attached: Paperclip,
  reminder_triggered: Bell,
  follow_up_sent: Send,
  application_submitted: FileCheck,
};

const ACTIVITY_TYPES: ActivityType[] = [
  "status_changed", "note_added", "task_created", "task_completed",
  "interview_scheduled", "interview_completed", "contact_created",
  "contact_updated", "email_sent", "email_received", "call_logged",
  "document_attached", "reminder_triggered", "follow_up_sent",
  "application_submitted",
];

export function ActivityTimeline({ targetPersonId, targetJobId }: ActivityTimelineProps) {
  const { t, locale } = useTranslations();
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getActivityTimeline({
      targetPersonId,
      targetJobId,
      activityType: filter !== "all" ? (filter as ActivityType) : undefined,
      pageSize: 100,
    });
    if (result.success && result.data) {
      const data = result.data as { activities: Record<string, unknown>[]; total: number };
      setActivities(data.activities);
      setTotal(data.total);
    }
    setLoading(false);
  }, [targetPersonId, targetJobId, filter]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full min-w-[120px] sm:w-[200px]">
            <SelectValue placeholder={t("crm.filterByType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("crm.allActivities")} ({total})</SelectItem>
            {ACTIVITY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{t(`crm.activity.${type}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <div className="text-center py-12">
          <ActivityIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{t("crm.noActivity")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("crm.noActivityDescription")}</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-6">
            {activities.map((activity) => {
              const type = activity.activityType as string;
              const Icon = ACTIVITY_ICONS[type] ?? ActivityIcon;
              const happenedAt = new Date(activity.happenedAt as string);

              return (
                <div key={activity.id as string} className="relative flex gap-4 pl-2">
                  <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{t(`crm.activity.${type}`)}</Badge>
                      {String(activity.linkedRecordName ?? "") && (
                        <span className="text-sm font-medium truncate">{String(activity.linkedRecordName)}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {happenedAt.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {Boolean(activity.details) && (
                      <p className="text-xs text-muted-foreground mt-1">{String(activity.details)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
