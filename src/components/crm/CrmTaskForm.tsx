"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface CrmTaskFormProps {
  onSubmit: (input: {
    title: string;
    description?: string;
    dueDate?: string;
    targets: { targetPersonId?: string; targetCompanyId?: string; targetJobId?: string }[];
  }) => Promise<void>;
}

type TargetType = "person" | "company" | "job";

export function CrmTaskForm({ onSubmit }: CrmTaskFormProps) {
  const { t } = useTranslations();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("person");
  const [targetId, setTargetId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);

    const targets: { targetPersonId?: string; targetCompanyId?: string; targetJobId?: string }[] = [];
    if (targetId.trim()) {
      const target: { targetPersonId?: string; targetCompanyId?: string; targetJobId?: string } = {};
      if (targetType === "person") target.targetPersonId = targetId.trim();
      else if (targetType === "company") target.targetCompanyId = targetId.trim();
      else target.targetJobId = targetId.trim();
      targets.push(target);
    }

    await onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: dueDate || undefined,
      targets,
    });

    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="crm-task-title">{t("crm.taskTitle")} *</Label>
        <Input
          id="crm-task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="crm-task-desc">{t("crm.taskDescription")}</Label>
        <Textarea
          id="crm-task-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      {/* Due Date */}
      <div className="space-y-1.5">
        <Label htmlFor="crm-task-due">{t("crm.dueDate")}</Label>
        <Input
          id="crm-task-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      {/* Target */}
      <div className="space-y-1.5">
        <Label>{t("crm.target")}</Label>
        <div className="flex gap-2">
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as TargetType)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="person">{t("crm.targetType.person")}</option>
            <option value="company">{t("crm.targetType.company")}</option>
            <option value="job">{t("crm.targetType.job")}</option>
          </select>
          <Input
            placeholder={t("crm.targetId")}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="flex-1"
          />
        </div>
      </div>

      <Button type="submit" disabled={!title.trim() || submitting} className="w-full">
        {t("crm.addTask")}
      </Button>
    </form>
  );
}
