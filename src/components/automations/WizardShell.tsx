"use client";

import { useMemo } from "react";
import { DialogFooter } from "@/components/ui/dialog";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { LocationBadge } from "@/components/ui/location-badge";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/i18n";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Loader2,
  Play,
} from "lucide-react";
import { parseKeywords, parseLocations } from "@/utils/automation.utils";
import { DynamicParamsForm } from "@/components/automations/DynamicParamsForm";
import { resolveWidgetOverrides } from "@/components/automations/widget-registry";
import type { UseAutomationWizardReturn } from "@/components/automations/useAutomationWizard";
import {
  SCHEDULE_FREQUENCIES,
  FREQUENCY_TRANSLATION_KEYS,
  HOURS,
  type ScheduleFrequency,
} from "@/components/automations/useAutomationWizard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Resume {
  id: string;
  title: string;
}

interface WizardShellProps {
  wizard: UseAutomationWizardReturn;
  resumes: Resume[];
  editResumeTitle?: string;
}

// ---------------------------------------------------------------------------
// WizardShell — Pure presentation component for the automation wizard
// ---------------------------------------------------------------------------

export function WizardShell({ wizard, resumes, editResumeTitle }: WizardShellProps) {
  const { t } = useTranslations();
  const { state, actions } = wizard;

  // Resolve search field widget overrides into a field -> component map
  const widgetOverrides = useMemo(
    () => resolveWidgetOverrides(state.searchFieldOverrides),
    [state.searchFieldOverrides],
  );

  // Determine if a widget override exists for keywords / location
  const KeywordsWidget = widgetOverrides["keywords"] ?? null;
  const LocationWidget = widgetOverrides["location"] ?? null;

  // Parse language from connector params for ESCO combobox
  const connectorParamsLanguage = state.connectorParamsValues.language as string | undefined;

  // Selected resume for review step
  const selectedResume = resumes.find((r) => r.id === state.form.getValues("resumeId"));

  return (
    <Form {...state.form}>
      <form
        onSubmit={state.form.handleSubmit(actions.submit, actions.handleFormSubmitError)}
      >
        {/* Step indicator */}
        <div className="flex justify-center gap-1 mb-4">
          {state.steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 w-8 rounded-full ${
                i <= state.step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="py-4">
          {/* Step 0: Basics */}
          <div className={state.step === 0 ? "space-y-4" : "hidden"}>
            <FormField
              control={state.form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("automations.automationName")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("automations.automationNamePlaceholder")} {...field} />
                  </FormControl>
                  <FormDescription>{t("automations.automationNameDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={state.form.control}
              name="jobBoard"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("automations.jobBoard")}</FormLabel>
                  <Select onValueChange={(val) => field.onChange(val)} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("automations.selectJobBoard")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <TooltipProvider>
                        {state.availableModules.map((mod) => {
                          const needsKey =
                            mod.credential.required &&
                            !state.configuredKeyModuleIds.has(mod.credential.moduleId);
                          return (
                            <Tooltip key={mod.moduleId}>
                              <TooltipTrigger asChild>
                                <div>
                                  <SelectItem value={mod.moduleId}>
                                    <span className={needsKey ? "flex items-center gap-2" : ""}>
                                      {mod.name}
                                      {needsKey && (
                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline-block" />
                                      )}
                                    </span>
                                  </SelectItem>
                                </div>
                              </TooltipTrigger>
                              {needsKey && (
                                <TooltipContent side="left">
                                  <p>{t("automations.jsearchApiKeyRequired")}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          );
                        })}
                      </TooltipProvider>
                    </SelectContent>
                  </Select>
                  {/* Credential feedback */}
                  <CredentialFeedback
                    selectedModule={state.availableModules.find((m) => m.moduleId === state.jobBoard) ?? null}
                    configuredKeyModuleIds={state.configuredKeyModuleIds}
                  />
                  <FormDescription>{t("automations.jobBoardDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Step 1: Search */}
          <div className={state.step === 1 ? "space-y-4" : "hidden"}>
            <FormField
              control={state.form.control}
              name="keywords"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("automations.searchKeywords")}</FormLabel>
                  <FormControl>
                    {KeywordsWidget ? (
                      <KeywordsWidget field={field} language={connectorParamsLanguage} />
                    ) : (
                      <Input placeholder={t("automations.keywordsPlaceholder")} {...field} />
                    )}
                  </FormControl>
                  {!KeywordsWidget && (
                    <FormDescription>{t("automations.keywordsDesc")}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={state.form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("automations.location")}</FormLabel>
                  <FormControl>
                    {LocationWidget ? (
                      <LocationWidget field={field} />
                    ) : (
                      <Input placeholder={t("automations.locationPlaceholder")} {...field} />
                    )}
                  </FormControl>
                  {!LocationWidget && (
                    <FormDescription>{t("automations.locationDesc")}</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dynamic connector params section (below keywords/location) */}
            {state.paramsSchema && state.paramsSchema.length > 0 && state.selectedModule && (
              <DynamicParamsForm
                moduleId={state.selectedModule.moduleId}
                schema={state.paramsSchema}
                values={state.connectorParamsValues}
                onChange={actions.updateConnectorParam}
              />
            )}
          </div>

          {/* Step 2: Resume */}
          <div className={state.step === 2 ? "space-y-4" : "hidden"}>
            <FormField
              control={state.form.control}
              name="resumeId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t("automations.resumeForMatching")}</FormLabel>
                  <Popover open={state.resumePopoverOpen} onOpenChange={actions.setResumePopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={state.resumePopoverOpen}
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          {field.value
                            ? (resumes.find((r) => r.id === field.value)?.title
                              ?? editResumeTitle
                              ?? field.value.slice(0, 8) + "...")
                            : t("automations.selectResume")}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t("automations.searchResume")} />
                        <CommandList>
                          <CommandEmpty>{t("automations.noResumeFound")}</CommandEmpty>
                          <CommandGroup>
                            {resumes.map((r) => (
                              <CommandItem
                                key={r.id}
                                value={r.id}
                                keywords={[r.title]}
                                onSelect={() => {
                                  field.onChange(r.id);
                                  actions.setResumePopoverOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === r.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                {r.title}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormDescription>{t("automations.resumeMatchDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {resumes.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("automations.noResumes")}</p>
            )}
          </div>

          {/* Step 3: Matching */}
          <div className={state.step === 3 ? "space-y-4" : "hidden"}>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="ai-scoring-toggle" className="text-sm font-medium">
                  {t("automations.enableAiScoring")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("automations.enableAiScoringDesc")}
                </p>
              </div>
              <Switch
                id="ai-scoring-toggle"
                checked={state.aiScoringEnabled}
                onCheckedChange={actions.handleAiScoringToggle}
              />
            </div>

            {!state.aiScoringEnabled && (
              <p className="text-sm text-muted-foreground rounded-lg bg-muted p-3">
                {t("automations.collectOnlyDesc")}
              </p>
            )}

            <FormField
              control={state.form.control}
              name="matchThreshold"
              render={({ field }) => (
                <FormItem className={!state.aiScoringEnabled ? "opacity-50 pointer-events-none" : ""}>
                  <FormLabel>
                    {t("automations.matchThreshold")}:{" "}
                    {state.aiScoringEnabled ? `${field.value}%` : t("automations.disabled")}
                  </FormLabel>
                  <FormControl>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[state.aiScoringEnabled ? field.value : 0]}
                      onValueChange={(value) => field.onChange(value[0])}
                      disabled={!state.aiScoringEnabled}
                    />
                  </FormControl>
                  <FormDescription>{t("automations.matchThresholdDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Step 4: Schedule */}
          <div className={state.step === 4 ? "space-y-4" : "hidden"}>
            <div>
              <Label className="text-sm font-medium">{t("automations.scheduleFrequency")}</Label>
              <Select
                onValueChange={(val) => actions.handleScheduleFrequencyChange(val as ScheduleFrequency)}
                value={state.scheduleFrequency}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder={t("automations.selectFrequency")} />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_FREQUENCIES.map((freq) => (
                    <SelectItem key={freq} value={freq}>
                      {t(FREQUENCY_TRANSLATION_KEYS[freq] as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1.5">
                {t("automations.scheduleFrequencyDesc")}
              </p>
            </div>

            <FormField
              control={state.form.control}
              name="scheduleHour"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("automations.preferredStartTime")}</FormLabel>
                  <Select
                    onValueChange={(val) => field.onChange(parseInt(val))}
                    value={field.value.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("automations.selectTime")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {HOURS.map((hour) => (
                        <SelectItem key={hour.value} value={hour.value.toString()}>
                          {hour.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{t("automations.scheduleDesc")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Step 5: Review */}
          <div className={state.step === 5 ? "space-y-4" : "hidden"}>
            <div className="rounded-lg border p-4 space-y-3">
              <ReviewRow label={t("automations.reviewName")} value={state.form.getValues("name") || "-"} />
              <ReviewRow
                label={t("automations.reviewJobBoard")}
                value={state.availableModules.find((m) => m.moduleId === state.jobBoard)?.name || state.jobBoard || "-"}
              />
              <ReviewKeywords
                jobBoard={state.jobBoard}
                keywords={state.form.getValues("keywords")}
                hasWidgetOverride={!!KeywordsWidget}
              />
              <ReviewLocation
                jobBoard={state.jobBoard}
                location={state.form.getValues("location")}
                hasWidgetOverride={!!LocationWidget}
              />
              <ReviewRow
                label={t("automations.reviewResume")}
                value={selectedResume?.title || t("automations.notSelected")}
              />
              <ReviewRow
                label={t("automations.reviewMatchThreshold")}
                value={actions.getMatchThresholdReviewText()}
              />
              <ReviewRow
                label={t("automations.reviewSchedule")}
                value={actions.getScheduleReviewText()}
              />

              {/* Dynamic connector params review */}
              <ReviewConnectorParams
                moduleId={state.selectedModule?.moduleId}
                schema={state.paramsSchema}
                values={state.connectorParamsValues}
              />
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <DialogFooter className="gap-2">
          {state.step > 0 && (
            <Button type="button" variant="outline" onClick={actions.back}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("automations.back")}
            </Button>
          )}
          {state.step < state.steps.length - 1 ? (
            <Button type="button" onClick={actions.next} disabled={!actions.canGoNext()}>
              {t("automations.next")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <>
              <Button type="submit" disabled={state.isSubmitting}>
                {state.isSubmitting && !state.runAfterCreate && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin motion-reduce:animate-none" />
                )}
                {state.isEditMode ? t("automations.updateAutomation") : t("automations.createAutomation")}
              </Button>
              {!state.isEditMode && (
                <Button
                  type="button"
                  disabled={state.isSubmitting}
                  onClick={actions.handleRunAfterCreateClick}
                >
                  {state.isSubmitting && state.runAfterCreate && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin motion-reduce:animate-none" />
                  )}
                  {!state.isSubmitting && <Play className="h-4 w-4 mr-1" />}
                  {t("automations.createAndRun")}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </form>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Internal: Credential feedback below the job board select
// ---------------------------------------------------------------------------

function CredentialFeedback({
  selectedModule,
  configuredKeyModuleIds,
}: {
  selectedModule: { credential: { required: boolean; moduleId: string } } | null;
  configuredKeyModuleIds: Set<string>;
}) {
  const { t } = useTranslations();

  if (!selectedModule) return null;

  // Module requires a key that is NOT configured
  if (
    selectedModule.credential.required &&
    !configuredKeyModuleIds.has(selectedModule.credential.moduleId)
  ) {
    return (
      <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t("automations.jsearchApiKeyRequired")}
        </p>
        <a
          href="/dashboard/settings"
          className="text-xs text-amber-600 dark:text-amber-500 underline hover:no-underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("automations.configureApiKey")}
        </a>
      </div>
    );
  }

  // Module does NOT require a key
  if (!selectedModule.credential.required) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {t("automations.noApiKeyNeeded")}
      </p>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal: Review row helpers
// ---------------------------------------------------------------------------

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ReviewKeywords({
  jobBoard,
  keywords,
  hasWidgetOverride,
}: {
  jobBoard: string;
  keywords: string;
  hasWidgetOverride: boolean;
}) {
  const { t } = useTranslations();

  // When widget override is present (e.g. EURES ESCO), keywords are ||-separated
  if (hasWidgetOverride && keywords?.includes("||")) {
    return (
      <div className="flex justify-between items-start">
        <span className="text-muted-foreground">{t("automations.reviewKeywords")}</span>
        <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
          {parseKeywords(keywords).map((kw) => (
            <Badge key={kw} variant="secondary">
              {kw}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{t("automations.reviewKeywords")}</span>
      <span className="font-medium">{keywords || "-"}</span>
    </div>
  );
}

function ReviewLocation({
  jobBoard,
  location,
  hasWidgetOverride,
}: {
  jobBoard: string;
  location: string;
  hasWidgetOverride: boolean;
}) {
  const { t } = useTranslations();

  // When widget override is present (e.g. EURES location), show LocationBadge chips
  if (hasWidgetOverride && location) {
    return (
      <div className="flex justify-between items-start">
        <span className="text-muted-foreground">{t("automations.reviewLocation")}</span>
        <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
          {parseLocations(location).map((code) => (
            <LocationBadge key={code} code={code} resolve={true} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{t("automations.reviewLocation")}</span>
      <span className="font-medium">{location || "-"}</span>
    </div>
  );
}

/**
 * Renders dynamic connector params in the review step.
 * Only shows params that have non-default values set by the user.
 */
function ReviewConnectorParams({
  moduleId,
  schema,
  values,
}: {
  moduleId?: string;
  schema: import("@/lib/connector/manifest").ConnectorParamsSchema | null;
  values: Record<string, unknown>;
}) {
  const { t } = useTranslations();

  if (!schema || schema.length === 0 || !moduleId) return null;

  // Filter to only show params that have values (excluding system keys like 'language')
  const displayableParams = schema.filter((field) => {
    const val = values[field.key];
    if (val === undefined || val === null || val === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  });

  if (displayableParams.length === 0) return null;

  const resolveLabel = (key: string): string => {
    const translated = t(key as any);
    return translated !== key ? translated : key;
  };

  const resolveOptionLabel = (fieldKey: string, optValue: string | number): string => {
    const key = `automations.paramOption.${moduleId}.${fieldKey}.${optValue}`;
    const translated = t(key as any);
    return translated !== key ? translated : String(optValue);
  };

  return (
    <>
      <div className="border-t pt-3 mt-3">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">
          {t("automations.connectorParams")}
        </span>
      </div>
      {displayableParams.map((field) => {
        const val = values[field.key];
        let displayValue: string;

        if (Array.isArray(val)) {
          displayValue = val.map((v) => resolveOptionLabel(field.key, v)).join(", ");
        } else if (field.type === "select" && val !== undefined) {
          displayValue = resolveOptionLabel(field.key, val as string | number);
        } else if (field.type === "boolean") {
          displayValue = val ? "Yes" : "No";
        } else {
          displayValue = String(val);
        }

        return (
          <div key={field.key} className="flex justify-between">
            <span className="text-muted-foreground">{resolveLabel(field.label)}</span>
            <span className="font-medium text-sm max-w-[60%] text-right">{displayValue}</span>
          </div>
        );
      })}
    </>
  );
}
