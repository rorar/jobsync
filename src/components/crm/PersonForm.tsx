"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type {
  TypedEmail,
  TypedPhone,
  ContactChannelType,
} from "@/models/person.model";

interface PersonFormProps {
  person?: Record<string, unknown> | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

const CHANNEL_TYPES: ContactChannelType[] = ["work", "home", "other"];

const emptyEmail = (): TypedEmail => ({
  email: "",
  type: "work",
  isPrimary: false,
});

const emptyPhone = (): TypedPhone => ({
  number: "",
  type: "work",
  isPrimary: false,
});

export default function PersonForm({ person, onSubmit, onCancel }: PersonFormProps) {
  const { t } = useTranslations();
  const isEdit = !!person;

  const [firstName, setFirstName] = useState((person?.firstName as string) ?? "");
  const [lastName, setLastName] = useState((person?.lastName as string) ?? "");
  const [jobTitle, setJobTitle] = useState((person?.jobTitle as string) ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState((person?.linkedinUrl as string) ?? "");
  const [companyName, setCompanyName] = useState(
    ((person?.company as Record<string, unknown>)?.label as string) ?? "",
  );
  const [addressStreet, setAddressStreet] = useState((person?.addressStreet as string) ?? "");
  const [addressCity, setAddressCity] = useState((person?.addressCity as string) ?? "");
  const [addressPostalCode, setAddressPostalCode] = useState(
    (person?.addressPostalCode as string) ?? "",
  );
  const [addressCountry, setAddressCountry] = useState(
    (person?.addressCountry as string) ?? "",
  );

  const [emails, setEmails] = useState<TypedEmail[]>(() => {
    const parsed = person?.emails;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as TypedEmail[];
    return [{ ...emptyEmail(), isPrimary: true }];
  });

  const [phones, setPhones] = useState<TypedPhone[]>(() => {
    const parsed = person?.phones;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as TypedPhone[];
    return [];
  });

  const [submitting, setSubmitting] = useState(false);

  // --- Email handlers ---
  const addEmail = () => setEmails((prev) => [...prev, emptyEmail()]);

  const removeEmail = (idx: number) =>
    setEmails((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Ensure at least one primary
      if (next.length > 0 && !next.some((e) => e.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });

  const updateEmail = (idx: number, field: keyof TypedEmail, value: unknown) =>
    setEmails((prev) =>
      prev.map((e, i) => {
        if (i !== idx) {
          // If setting primary, unset others
          if (field === "isPrimary" && value === true) return { ...e, isPrimary: false };
          return e;
        }
        return { ...e, [field]: value };
      }),
    );

  // --- Phone handlers ---
  const addPhone = () => setPhones((prev) => [...prev, emptyPhone()]);

  const removePhone = (idx: number) =>
    setPhones((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((p) => p.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });

  const updatePhone = (idx: number, field: keyof TypedPhone, value: unknown) =>
    setPhones((prev) =>
      prev.map((p, i) => {
        if (i !== idx) {
          if (field === "isPrimary" && value === true) return { ...p, isPrimary: false };
          return p;
        }
        return { ...p, [field]: value };
      }),
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // Filter out empty emails/phones
    const validEmails = emails.filter((em) => em.email.trim() !== "");
    const validPhones = phones.filter((ph) => ph.number.trim() !== "");

    await onSubmit({
      firstName: firstName || null,
      lastName: lastName || null,
      emails: validEmails,
      phones: validPhones,
      jobTitle: jobTitle || null,
      linkedinUrl: linkedinUrl || null,
      // companyId linking comes later; for now just pass null
      companyId: (person?.companyId as string) ?? null,
      addressStreet: addressStreet || null,
      addressCity: addressCity || null,
      addressPostalCode: addressPostalCode || null,
      addressCountry: addressCountry || null,
    });

    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t("crm.firstName")}</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t("crm.lastName")}</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      </div>

      {/* Emails */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t("crm.email")}</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addEmail}>
            <Plus className="mr-1 h-3 w-3" />
            {t("crm.email")}
          </Button>
        </div>
        {emails.map((em, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="email@example.com"
              value={em.email}
              onChange={(e) => updateEmail(idx, "email", e.target.value)}
              className="flex-1"
            />
            <Select
              value={em.type}
              onValueChange={(v) => updateEmail(idx, "type", v)}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_TYPES.map((ct) => (
                  <SelectItem key={ct} value={ct}>
                    {t(`crm.channelType.${ct}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1" title={t("crm.primaryEmail")}>
              <Switch
                checked={em.isPrimary}
                onCheckedChange={(checked) => updateEmail(idx, "isPrimary", checked)}
              />
            </div>
            {emails.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeEmail(idx)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Phones */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t("crm.phone")}</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addPhone}>
            <Plus className="mr-1 h-3 w-3" />
            {t("crm.phone")}
          </Button>
        </div>
        {phones.map((ph, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              type="tel"
              placeholder="+49 123 456 7890"
              value={ph.number}
              onChange={(e) => updatePhone(idx, "number", e.target.value)}
              className="flex-1"
            />
            <Select
              value={ph.type}
              onValueChange={(v) => updatePhone(idx, "type", v)}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_TYPES.map((ct) => (
                  <SelectItem key={ct} value={ct}>
                    {t(`crm.channelType.${ct}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1" title={t("crm.primaryEmail")}>
              <Switch
                checked={ph.isPrimary}
                onCheckedChange={(checked) => updatePhone(idx, "isPrimary", checked)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removePhone(idx)}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
        {phones.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            &mdash;
          </p>
        )}
      </div>

      {/* Job Title */}
      <div className="space-y-2">
        <Label htmlFor="jobTitle">{t("crm.jobTitle")}</Label>
        <Input
          id="jobTitle"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        />
      </div>

      {/* LinkedIn */}
      <div className="space-y-2">
        <Label htmlFor="linkedinUrl">{t("crm.linkedinUrl")}</Label>
        <Input
          id="linkedinUrl"
          type="url"
          placeholder="https://linkedin.com/in/..."
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
        />
      </div>

      {/* Company (text input for now) */}
      <div className="space-y-2">
        <Label htmlFor="company">{t("crm.company")}</Label>
        <Input
          id="company"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          disabled={isEdit}
          placeholder={isEdit ? "" : t("crm.company")}
        />
      </div>

      {/* Address */}
      <div className="space-y-3">
        <Label>{t("crm.address")}</Label>
        <Input
          placeholder={t("crm.street")}
          value={addressStreet}
          onChange={(e) => setAddressStreet(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            placeholder={t("crm.city")}
            value={addressCity}
            onChange={(e) => setAddressCity(e.target.value)}
          />
          <Input
            placeholder={t("crm.postalCode")}
            value={addressPostalCode}
            onChange={(e) => setAddressPostalCode(e.target.value)}
          />
        </div>
        <Input
          placeholder={t("crm.country")}
          value={addressCountry}
          onChange={(e) => setAddressCountry(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("crm.cancel")}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? t("crm.editContact") : t("crm.addContact")}
        </Button>
      </div>
    </form>
  );
}
