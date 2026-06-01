"use client";

/**
 * ProfilePreferencesCard — user's home location + preferred currency (Welle 2,
 * F-AJ-06, ADR-034). Sits above the résumé list in the profile page.
 *
 * - Reuses CountrySelect / SubdivisionSelect / CurrencySelect + the reference-data
 *   OHS actions (getCountryOptions / getSubdivisionOptions / getCurrencyOptions).
 * - Persists via the standalone updateProfilePreferences action (shared with the
 *   future Onboarding wizard, ROADMAP 2.1).
 * - Cascade: Region is disabled until a country is chosen; changing the country
 *   clears the stale subdivision (the prior region is invalid for a new country).
 * - All three fields optional. Home location is the ROADMAP 2.5 distance/map
 *   reference point; currency drives salary display.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/i18n";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Button } from "../ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "../ui/use-toast";
import { CountrySelect, type CountryOption } from "../ui/country-select";
import { SubdivisionSelect, type SubdivisionOption } from "../ui/subdivision-select";
import { CurrencySelect, type CurrencyOption } from "../ui/currency-select";
import {
  getProfilePreferences,
  updateProfilePreferences,
} from "@/actions/profile.actions";
import {
  getCountryOptions,
  getSubdivisionOptions,
  getCurrencyOptions,
} from "@/actions/reference-data.actions";

const ProfilePreferencesCard = () => {
  const { t, locale } = useTranslations();

  const [country, setCountry] = useState("");
  const [subdivision, setSubdivision] = useState("");
  const [currency, setCurrency] = useState("");

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [subdivisions, setSubdivisions] = useState<SubdivisionOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);

  const [subLoading, setSubLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // --- Load options + current preferences on mount -------------------------
  useEffect(() => {
    let active = true;
    (async () => {
      const [prefs, countryOpts, currencyOpts] = await Promise.all([
        getProfilePreferences(),
        getCountryOptions(locale),
        getCurrencyOptions(locale),
      ]);
      if (!active) return;
      setCountries(countryOpts);
      setCurrencies(currencyOpts);
      if (prefs) {
        setCountry(prefs.addressCountryCode ?? "");
        setSubdivision(prefs.addressSubdivisionCode ?? "");
        setCurrency(prefs.preferredCurrency ?? "");
      }
    })();
    return () => {
      active = false;
    };
  }, [locale]);

  // --- Load subdivisions whenever the country changes ----------------------
  useEffect(() => {
    if (!country) {
      setSubdivisions([]);
      return;
    }
    let active = true;
    setSubLoading(true);
    (async () => {
      const subs = await getSubdivisionOptions(country, locale);
      if (!active) return;
      setSubdivisions(subs);
      setSubLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [country, locale]);

  // Changing the country invalidates the previously-selected region.
  const onCountryChange = useCallback((code: string) => {
    setCountry(code);
    setSubdivision("");
  }, []);

  const onSave = useCallback(async () => {
    setSaving(true);
    const res = await updateProfilePreferences({
      addressCountryCode: country || null,
      addressSubdivisionCode: subdivision || null,
      preferredCurrency: currency || null,
    });
    setSaving(false);
    if (res.success) {
      toast({ title: t("profile.preferencesSaved") });
    } else {
      toast({
        variant: "destructive",
        title: t("profile.error"),
        description: res.message ? t(res.message) : undefined,
      });
    }
  }, [country, subdivision, currency, t]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <h2 className="text-lg font-semibold leading-none tracking-tight">
          {t("profile.homeLocationTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("profile.allFieldsOptional")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Country + Region: the dependent pair, side-by-side on >=sm */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="profile-home-country" className="text-sm font-medium">
              {t("profile.homeCountry")}
            </label>
            <CountrySelect
              value={country}
              onValueChange={onCountryChange}
              countries={countries}
              className="w-full"
            />
            <p id="profile-home-country-help" className="text-sm text-muted-foreground">
              {t("profile.homeCountryHelp")}
            </p>
          </div>

          {/* Region: appears only once a country with subdivisions is chosen.
              SubdivisionSelect self-hides (returns null) when empty, so we gate
              the whole labelled block to avoid a dangling label — consistent
              with the existing PersonForm behavior. */}
          {country && (subLoading || subdivisions.length > 0) && (
            <div className="space-y-1.5">
              <label htmlFor="profile-home-region" className="text-sm font-medium">
                {t("profile.homeRegion")}
              </label>
              <SubdivisionSelect
                value={subdivision}
                onValueChange={setSubdivision}
                subdivisions={subdivisions}
                loading={subLoading}
              />
              <p id="profile-home-region-help" className="text-sm text-muted-foreground">
                {t("profile.homeRegionHelp")}
              </p>
            </div>
          )}
        </div>

        {/* Currency: a separate concern, half-width on desktop */}
        <div className="space-y-1.5 sm:max-w-xs">
          <label htmlFor="profile-currency" className="text-sm font-medium">
            {t("profile.preferredCurrency")}
          </label>
          <CurrencySelect
            value={currency}
            onValueChange={setCurrency}
            currencies={currencies}
            className="w-full"
          />
          <p id="profile-currency-help" className="text-sm text-muted-foreground">
            {t("profile.preferredCurrencyHelp")}
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onSave} disabled={saving}>
            {saving && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
            )}
            {t("profile.savePreferences")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProfilePreferencesCard;
