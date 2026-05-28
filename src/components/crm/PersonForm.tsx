"use client";

import { useEffect, useState } from "react";
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
import { CountrySelect, type CountryOption } from "@/components/ui/country-select";
import { SubdivisionSelect, type SubdivisionOption } from "@/components/ui/subdivision-select";
import { getCountryOptions, getSubdivisionOptions } from "@/actions/person.actions";
import type {
  TypedEmail,
  TypedPhone,
  CompanyAssociation,
  SocialProfile,
  SocialPlatform,
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
  const { t, locale } = useTranslations();
  const isEdit = !!person;

  const [firstName, setFirstName] = useState((person?.firstName as string) ?? "");
  const [lastName, setLastName] = useState((person?.lastName as string) ?? "");
  const [headline, setHeadline] = useState((person?.headline as string) ?? "");
  const [socialProfiles, setSocialProfiles] = useState<SocialProfile[]>(() => {
    const parsed = person?.socialProfiles;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as SocialProfile[];
    return [];
  });
  const [companies, setCompanies] = useState<CompanyAssociation[]>(() => {
    const parsed = person?.companies;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as CompanyAssociation[];
    return [];
  });
  const [addressStreet, setAddressStreet] = useState((person?.addressStreet as string) ?? "");
  const [addressCity, setAddressCity] = useState((person?.addressCity as string) ?? "");
  const [addressPostalCode, setAddressPostalCode] = useState(
    (person?.addressPostalCode as string) ?? "",
  );
  const [addressCountry, setAddressCountry] = useState(
    (person?.addressCountry as string) ?? "",
  );
  const [addressCountryCode, setAddressCountryCode] = useState(
    (person?.addressCountryCode as string) ?? "",
  );
  const [addressSubdivisionCode, setAddressSubdivisionCode] = useState(
    (person?.addressSubdivisionCode as string) ?? "",
  );
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [subdivisions, setSubdivisions] = useState<SubdivisionOption[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [subdivisionsLoading, setSubdivisionsLoading] = useState(false);

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

  // Load countries on mount
  useEffect(() => {
    let cancelled = false;
    setCountriesLoading(true);
    getCountryOptions(locale)
      .then((c) => { if (!cancelled) setCountries(c); })
      .finally(() => { if (!cancelled) setCountriesLoading(false); });
    return () => { cancelled = true; };
  }, [locale]);

  // Load subdivisions when country changes
  useEffect(() => {
    if (!addressCountryCode) {
      setSubdivisions([]);
      setAddressSubdivisionCode("");
      setSubdivisionsLoading(false);
      return;
    }
    let cancelled = false;
    setSubdivisionsLoading(true);
    getSubdivisionOptions(addressCountryCode, locale)
      .then((s) => { if (!cancelled) setSubdivisions(s); })
      .finally(() => { if (!cancelled) setSubdivisionsLoading(false); });
    return () => { cancelled = true; };
  }, [addressCountryCode, locale]);

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
  const addPhone = () =>
    setPhones((prev) =>
      prev.length === 0
        ? [{ ...emptyPhone(), isPrimary: true }]
        : [...prev, emptyPhone()],
    );

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

  // --- Company handlers ---
  const emptyCompany = (): CompanyAssociation => ({
    companyId: "",
    companyLabel: "",
    role: null,
    isPrimary: false,
    startDate: null,
    endDate: null,
  });

  const addCompany = () =>
    setCompanies((prev) =>
      prev.length === 0
        ? [{ ...emptyCompany(), isPrimary: true }]
        : [...prev, emptyCompany()],
    );

  const removeCompany = (idx: number) =>
    setCompanies((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((c) => c.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true };
      }
      return next;
    });

  const updateCompany = (idx: number, field: keyof CompanyAssociation, value: unknown) =>
    setCompanies((prev) =>
      prev.map((c, i) => {
        if (i !== idx) {
          if (field === "isPrimary" && value === true) return { ...c, isPrimary: false };
          return c;
        }
        return { ...c, [field]: value };
      }),
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // Filter out empty entries
    const validEmails = emails.filter((em) => em.email.trim() !== "");
    const validPhones = phones.filter((ph) => ph.number.trim() !== "");
    const validCompanies = companies.filter((c) => c.companyLabel.trim() !== "");

    await onSubmit({
      firstName: firstName || null,
      lastName: lastName || null,
      emails: validEmails,
      phones: validPhones,
      companies: validCompanies,
      headline: headline || null,
      socialProfiles: socialProfiles.filter((sp) => sp.url.trim() !== ""),
      addressStreet: addressStreet || null,
      addressCity: addressCity || null,
      addressPostalCode: addressPostalCode || null,
      addressCountry: addressCountry || null,
      addressCountryCode: addressCountryCode || null,
      addressSubdivisionCode: addressSubdivisionCode || null,
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
          <div key={em.email || `email-${idx}`} className="flex items-center gap-2">
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
                aria-label={t("crm.removeEmail")}
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
          <div key={ph.number || `phone-${idx}`} className="flex items-center gap-2">
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
            <div className="flex items-center gap-1" title={t("crm.primaryPhone")}>
              <Switch
                checked={ph.isPrimary}
                onCheckedChange={(checked) => updatePhone(idx, "isPrimary", checked)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("crm.removePhone")}
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

      {/* Headline (Kette B: replaces jobTitle) */}
      <div className="space-y-2">
        <Label htmlFor="headline">{t("crm.headline")}</Label>
        <Input
          id="headline"
          placeholder={t("crm.headlinePlaceholder")}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </div>

      {/* Social Profiles (Kette B: replaces linkedinUrl) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t("crm.socialProfiles")}</Label>
          <Button type="button" variant="ghost" size="sm" onClick={() =>
            setSocialProfiles((prev) => [...prev, { platform: "linkedin" as SocialPlatform, url: "" }])
          }>
            <Plus className="mr-1 h-3 w-3" />
            {t("crm.socialProfiles")}
          </Button>
        </div>
        {socialProfiles.map((sp, idx) => (
          <div key={sp.url || `social-${idx}`} className="flex items-center gap-2">
            <Select
              value={sp.platform}
              onValueChange={(v) =>
                setSocialProfiles((prev) =>
                  prev.map((s, i) => (i === idx ? { ...s, platform: v as SocialPlatform } : s)),
                )
              }
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["linkedin", "xing", "github", "twitter", "other"] as SocialPlatform[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`crm.platform.${p}` as any)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="url"
              placeholder="https://..."
              value={sp.url}
              onChange={(e) =>
                setSocialProfiles((prev) =>
                  prev.map((s, i) => (i === idx ? { ...s, url: e.target.value } : s)),
                )
              }
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("crm.removeSocialProfile")}
              onClick={() => setSocialProfiles((prev) => prev.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      {/* Companies (multi-association) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t("crm.company")}</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addCompany}>
            <Plus className="mr-1 h-3 w-3" />
            {t("crm.company")}
          </Button>
        </div>
        {companies.map((c, idx) => (
          <div key={c.companyId || c.companyLabel || `company-${idx}`} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder={t("crm.company")}
                value={c.companyLabel}
                onChange={(e) => updateCompany(idx, "companyLabel", e.target.value)}
                className="flex-1"
              />
              <div className="flex items-center gap-1" title={t("crm.primary")}>
                <Switch
                  checked={c.isPrimary}
                  onCheckedChange={(checked) => updateCompany(idx, "isPrimary", checked)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("crm.removeCompany")}
                onClick={() => removeCompany(idx)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
            <Input
              placeholder={t("crm.jobTitle")}
              value={c.role ?? ""}
              onChange={(e) => updateCompany(idx, "role", e.target.value || null)}
              className="text-sm"
            />
          </div>
        ))}
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
        <CountrySelect
          value={addressCountryCode}
          onValueChange={(code) => {
            setAddressCountryCode(code);
            // Sync free-text country for backward compat
            if (code) {
              const c = countries.find((x) => x.code === code);
              setAddressCountry(c?.name ?? code);
            } else {
              setAddressCountry("");
            }
          }}
          countries={countries}
          loading={countriesLoading}
        />
        {(subdivisions.length > 0 || subdivisionsLoading) && (
          <SubdivisionSelect
            value={addressSubdivisionCode}
            onValueChange={setAddressSubdivisionCode}
            subdivisions={subdivisions}
            loading={subdivisionsLoading}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("crm.cancel")}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {isEdit ? t("crm.editContact") : t("crm.addContact")}
        </Button>
      </div>
    </form>
  );
}
