"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateAutomationSchema, type CreateAutomationInput } from "@/models/automation.schema";
import { createAutomation, updateAutomation } from "@/actions/automation.actions";
import { getUserApiKeys } from "@/actions/apiKey.actions";
import { getActiveModules, type ModuleManifestSummary } from "@/actions/module.actions";
import { ConnectorType, type ConnectorParamsSchema, type SearchFieldOverride } from "@/lib/connector/manifest";
import { toast } from "@/components/ui/use-toast";
import { useTranslations } from "@/i18n";
import type { AutomationWithResume } from "@/models/automation.model";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export type ScheduleFrequency = "6h" | "12h" | "daily" | "2d" | "weekly";

export const SCHEDULE_FREQUENCIES: ScheduleFrequency[] = ["6h", "12h", "daily", "2d", "weekly"];

export const FREQUENCY_TRANSLATION_KEYS: Record<ScheduleFrequency, string> = {
  "6h": "automations.scheduleEvery6Hours",
  "12h": "automations.scheduleEvery12Hours",
  "daily": "automations.scheduleDaily",
  "2d": "automations.scheduleEvery2Days",
  "weekly": "automations.scheduleWeekly",
};

export const STEP_KEYS = [
  { id: "basics", titleKey: "automations.stepBasics", descKey: "automations.stepBasicsDesc" },
  { id: "search", titleKey: "automations.stepSearch", descKey: "automations.stepSearchDesc" },
  { id: "resume", titleKey: "automations.stepResume", descKey: "automations.stepResumeDesc" },
  { id: "matching", titleKey: "automations.stepMatching", descKey: "automations.stepMatchingDesc" },
  { id: "schedule", titleKey: "automations.stepSchedule", descKey: "automations.stepScheduleDesc" },
  { id: "review", titleKey: "automations.stepReview", descKey: "automations.stepReviewDesc" },
] as const;

export const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, "0")}:00`,
}));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Resume {
  id: string;
  title: string;
}

export interface UseAutomationWizardOptions {
  open: boolean;
  resumes: Resume[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editAutomation?: AutomationWithResume | null;
}

export interface WizardState {
  step: number;
  steps: typeof STEP_KEYS;
  form: UseFormReturn<CreateAutomationInput>;
  availableModules: ModuleManifestSummary[];
  configuredKeyModuleIds: Set<string>;
  selectedModule: ModuleManifestSummary | null;
  paramsSchema: ConnectorParamsSchema | null;
  searchFieldOverrides: SearchFieldOverride[];
  connectorParamsValues: Record<string, unknown>;
  aiScoringEnabled: boolean;
  scheduleFrequency: ScheduleFrequency;
  isSubmitting: boolean;
  runAfterCreate: boolean;
  resumePopoverOpen: boolean;
  isEditMode: boolean;
  jobBoard: string;
}

export interface WizardActions {
  next: () => void;
  back: () => void;
  goTo: (step: number) => void;
  canGoNext: () => boolean;
  submit: (data: CreateAutomationInput) => Promise<void>;
  handleFormSubmitError: (errors: Record<string, any>) => void;
  setModule: (moduleId: string) => void;
  updateConnectorParam: (key: string, value: unknown) => void;
  handleAiScoringToggle: (enabled: boolean) => void;
  handleScheduleFrequencyChange: (freq: ScheduleFrequency) => void;
  setResumePopoverOpen: (open: boolean) => void;
  setRunAfterCreate: (run: boolean) => void;
  handleRunAfterCreateClick: () => void;
  handleClose: () => void;
  getScheduleReviewText: () => string;
  getMatchThresholdReviewText: () => string;
}

export interface UseAutomationWizardReturn {
  state: WizardState;
  actions: WizardActions;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAutomationWizard({
  open,
  resumes,
  onOpenChange,
  onSuccess,
  editAutomation,
}: UseAutomationWizardOptions): UseAutomationWizardReturn {
  const { t } = useTranslations();

  // ── Form ────────────────────────────────────────────────────────────
  const form = useForm<CreateAutomationInput>({
    resolver: zodResolver(CreateAutomationSchema),
    mode: "onChange",
    defaultValues: {
      name: editAutomation?.name ?? "",
      jobBoard: editAutomation?.jobBoard ?? "jsearch",
      keywords: editAutomation?.keywords ?? "",
      location: editAutomation?.location ?? "",
      resumeId: editAutomation?.resumeId ?? "",
      matchThreshold: editAutomation?.matchThreshold ?? 80,
      scheduleHour: editAutomation?.scheduleHour ?? 8,
    },
  });

  // ── Step navigation ─────────────────────────────────────────────────
  const [step, setStep] = useState(0);

  // ── Module & credential state ───────────────────────────────────────
  const [availableModules, setAvailableModules] = useState<ModuleManifestSummary[]>([]);
  const [configuredKeyModuleIds, setConfiguredKeyModuleIds] = useState<Set<string>>(new Set());

  // ── Wizard UI state ─────────────────────────────────────────────────
  const [aiScoringEnabled, setAiScoringEnabled] = useState(true);
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>("daily");
  const [resumePopoverOpen, setResumePopoverOpen] = useState(false);
  const [runAfterCreate, setRunAfterCreate] = useState(false);
  const runAfterCreateRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Dynamic connector params values ─────────────────────────────────
  const [connectorParamsValues, setConnectorParamsValues] = useState<Record<string, unknown>>({});

  // ── Watched form values ─────────────────────────────────────────────
  const jobBoard = form.watch("jobBoard");

  // ── Derived: selected module manifest ───────────────────────────────
  const selectedModule = useMemo(
    () => availableModules.find((m) => m.moduleId === jobBoard) ?? null,
    [availableModules, jobBoard],
  );

  const paramsSchema = useMemo(
    () => selectedModule?.connectorParamsSchema ?? null,
    [selectedModule],
  );

  const searchFieldOverrides = useMemo(
    () => selectedModule?.searchFieldOverrides ?? [],
    [selectedModule],
  );

  // ── Helpers ─────────────────────────────────────────────────────────

  const tryParseConnectorParams = useCallback((params?: string | null) => {
    try {
      return params ? JSON.parse(params) : undefined;
    } catch {
      return undefined;
    }
  }, []);

  /** Serialize current connectorParamsValues + any system values (like language) into JSON and set on form. */
  const syncConnectorParamsToForm = useCallback(
    (values: Record<string, unknown>) => {
      // Filter out undefined values to keep JSON lean
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v !== undefined && v !== null && v !== "") {
          cleaned[k] = v;
        }
      }
      if (Object.keys(cleaned).length > 0) {
        form.setValue("connectorParams", JSON.stringify(cleaned));
      } else {
        form.setValue("connectorParams", undefined);
      }
    },
    [form],
  );

  // ── Load modules + API keys on open ─────────────────────────────────

  useEffect(() => {
    if (!open) return;

    getUserApiKeys()
      .then((result) => {
        if (result.success && result.data) {
          setConfiguredKeyModuleIds(new Set(result.data.map((k) => k.moduleId)));
        } else {
          setConfiguredKeyModuleIds(new Set());
        }
      })
      .catch(() => setConfiguredKeyModuleIds(new Set()));

    getActiveModules(ConnectorType.JOB_DISCOVERY)
      .then((result) => {
        if (result.success && result.data) {
          setAvailableModules(result.data);
        }
      })
      .catch(() => setAvailableModules([]));
  }, [open]);

  // ── Reset form on open / editAutomation change ──────────────────────

  useEffect(() => {
    if (!open) return;

    const editParams = editAutomation?.connectorParams
      ? tryParseConnectorParams(editAutomation.connectorParams)
      : undefined;

    // Restore AI scoring state
    const editThreshold = editAutomation?.matchThreshold ?? 80;
    const isAiEnabled = editThreshold > 0;
    setAiScoringEnabled(isAiEnabled);

    // Restore schedule frequency from DB field (first-class column)
    const editFrequency = (editAutomation?.scheduleFrequency as ScheduleFrequency) ?? "daily";
    setScheduleFrequency(editFrequency);

    // Restore connectorParams values for dynamic form
    if (editParams) {
      // Remove system-managed keys (language is auto-injected)
      const { language: _lang, scheduleFrequency: _sf, ...moduleParams } = editParams;
      setConnectorParamsValues(moduleParams);
      syncConnectorParamsToForm(moduleParams);
    } else {
      setConnectorParamsValues({});
      syncConnectorParamsToForm({});
    }

    form.reset({
      name: editAutomation?.name ?? "",
      jobBoard: editAutomation?.jobBoard ?? "jsearch",
      keywords: editAutomation?.keywords ?? "",
      location: editAutomation?.location ?? "",
      resumeId: editAutomation?.resumeId ?? "",
      matchThreshold: editThreshold,
      scheduleHour: editAutomation?.scheduleHour ?? 8,
    });
    setStep(0);
  }, [open, editAutomation, form, tryParseConnectorParams, syncConnectorParamsToForm]);

  // ── Auto-correct default jobBoard when no key configured ────────────

  useEffect(() => {
    if (!open || availableModules.length === 0 || editAutomation) return;

    const currentBoard = form.getValues("jobBoard");
    const currentMod = availableModules.find((m) => m.moduleId === currentBoard);

    if (!currentMod?.credential.required || configuredKeyModuleIds.has(currentMod.credential.moduleId)) {
      return;
    }

    const fallback = availableModules.find(
      (m) => !m.credential.required || configuredKeyModuleIds.has(m.credential.moduleId),
    );
    if (fallback) {
      form.setValue("jobBoard", fallback.moduleId);
    }
  }, [open, availableModules, configuredKeyModuleIds, editAutomation, form]);

  // ── EURES language auto-injection ───────────────────────────────────

  useEffect(() => {
    if (jobBoard !== "eures" || !open) return;

    const htmlLang = document.documentElement.lang || "en";
    setConnectorParamsValues((prev) => {
      if (prev.language === htmlLang) return prev;
      const next = { ...prev, language: htmlLang };
      syncConnectorParamsToForm(next);
      return next;
    });
  }, [jobBoard, open, syncConnectorParamsToForm]);

  // ── Apply defaults from schema when module changes ──────────────────

  useEffect(() => {
    if (!paramsSchema || !selectedModule) return;
    // Only apply defaults when NOT editing (avoid overwriting saved values)
    if (editAutomation && editAutomation.jobBoard === selectedModule.moduleId) return;

    const defaults: Record<string, unknown> = {};
    for (const field of paramsSchema) {
      if (field.defaultValue !== undefined) {
        defaults[field.key] = field.defaultValue;
      }
    }

    // Preserve language if it was already set
    setConnectorParamsValues((prev) => {
      const languagePreserved = prev.language ? { language: prev.language } : {};
      const next = { ...languagePreserved, ...defaults };
      syncConnectorParamsToForm(next);
      return next;
    });
  }, [paramsSchema, selectedModule, editAutomation, syncConnectorParamsToForm]);

  // ── Actions ─────────────────────────────────────────────────────────

  const canGoNext = useCallback((): boolean => {
    switch (step) {
      case 0:
        return (form.getValues("name")?.trim().length ?? 0) > 0;
      case 1:
        return (
          (form.getValues("keywords")?.trim().length ?? 0) > 0 &&
          (form.getValues("location")?.trim().length ?? 0) > 0
        );
      case 2:
        return (form.getValues("resumeId")?.length ?? 0) > 0;
      case 3:
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, form]);

  const next = useCallback(() => {
    if (step < STEP_KEYS.length - 1) setStep(step + 1);
  }, [step]);

  const back = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  const goTo = useCallback((s: number) => {
    if (s >= 0 && s < STEP_KEYS.length) setStep(s);
  }, []);

  const setModule = useCallback(
    (moduleId: string) => {
      form.setValue("jobBoard", moduleId);
    },
    [form],
  );

  const updateConnectorParam = useCallback(
    (key: string, value: unknown) => {
      setConnectorParamsValues((prev) => {
        const next = { ...prev, [key]: value };
        syncConnectorParamsToForm(next);
        return next;
      });
    },
    [syncConnectorParamsToForm],
  );

  const handleAiScoringToggle = useCallback(
    (enabled: boolean) => {
      setAiScoringEnabled(enabled);
      form.setValue("matchThreshold", enabled ? 80 : 0);
    },
    [form],
  );

  const handleScheduleFrequencyChange = useCallback(
    (freq: ScheduleFrequency) => {
      setScheduleFrequency(freq);
    },
    [],
  );

  const handleClose = useCallback(() => {
    form.reset();
    setStep(0);
    setConnectorParamsValues({});
    syncConnectorParamsToForm({});
    onOpenChange(false);
  }, [form, onOpenChange, syncConnectorParamsToForm]);

  /** Parse a "performanceWarning:<count>" message. */
  const parseWarningMessage = useCallback(
    (message?: string): string | null => {
      if (!message) return null;
      const prefix = "performanceWarning:";
      if (!message.startsWith(prefix)) return null;
      const count = message.slice(prefix.length);
      return t("automations.performanceWarningBanner" as any).replace("{count}", count);
    },
    [t],
  );

  const submit = useCallback(
    async (data: CreateAutomationInput) => {
      setIsSubmitting(true);
      try {
        // Set scheduleFrequency as first-class field
        data.scheduleFrequency = scheduleFrequency;

        const result = editAutomation
          ? await updateAutomation(editAutomation.id, data)
          : await createAutomation(data);

        if (result.success) {
          // "Create & Run Now" support
          if (runAfterCreateRef.current && result.data?.id) {
            try {
              await fetch(`/api/automations/${result.data.id}/run`, { method: "POST" });
            } catch {
              // Non-blocking
            }
            runAfterCreateRef.current = false;
            setRunAfterCreate(false);
          }

          toast({
            title: editAutomation ? t("automations.automationUpdated" as any) : t("automations.automationCreated" as any),
            description: editAutomation
              ? t("automations.automationUpdatedDesc" as any)
              : t("automations.automationCreatedDesc" as any),
          });

          const warningMsg = parseWarningMessage(result.message);
          if (warningMsg) {
            toast({
              title: t("automations.warning" as any),
              description: warningMsg,
              variant: "default",
            });
          }

          form.reset();
          setStep(0);
          setConnectorParamsValues({});
          syncConnectorParamsToForm({});
          onOpenChange(false);
          onSuccess();
        } else {
          toast({
            title: t("automations.validationError" as any),
            description: result.message || t("automations.somethingWentWrong" as any),
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: t("automations.validationError" as any),
          description: t("automations.failedToSave" as any),
          variant: "destructive",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [editAutomation, form, onOpenChange, onSuccess, parseWarningMessage, scheduleFrequency, syncConnectorParamsToForm, t],
  );

  const handleFormSubmitError = useCallback(
    (errors: Record<string, any>) => {
      const firstError = Object.values(errors)[0];
      if (firstError?.message) {
        toast({
          title: t("automations.validationError" as any),
          description: firstError.message as string,
          variant: "destructive",
        });
      }
    },
    [t],
  );

  const handleRunAfterCreateClick = useCallback(() => {
    runAfterCreateRef.current = true;
    setRunAfterCreate(true);
    form.handleSubmit(submit)();
  }, [form, submit]);

  const getScheduleReviewText = useCallback((): string => {
    const hour = (form.getValues("scheduleHour") ?? 8).toString().padStart(2, "0");
    const freqKey = FREQUENCY_TRANSLATION_KEYS[scheduleFrequency];
    const freqLabel = t(freqKey as any);

    if (scheduleFrequency === "daily") {
      return `${t("automations.dailyAt" as any)} ${hour}:00`;
    }
    return `${freqLabel} (${hour}:00)`;
  }, [form, scheduleFrequency, t]);

  const getMatchThresholdReviewText = useCallback((): string => {
    if (!aiScoringEnabled || (form.getValues("matchThreshold") ?? 80) === 0) {
      return t("automations.collectOnlyMode" as any);
    }
    return `${form.getValues("matchThreshold") ?? 80}%`;
  }, [aiScoringEnabled, form, t]);

  // ── Return ──────────────────────────────────────────────────────────

  return {
    state: {
      step,
      steps: STEP_KEYS,
      form,
      availableModules,
      configuredKeyModuleIds,
      selectedModule,
      paramsSchema,
      searchFieldOverrides,
      connectorParamsValues,
      aiScoringEnabled,
      scheduleFrequency,
      isSubmitting,
      runAfterCreate,
      resumePopoverOpen,
      isEditMode: !!editAutomation,
      jobBoard,
    },
    actions: {
      next,
      back,
      goTo,
      canGoNext,
      submit,
      handleFormSubmitError,
      setModule,
      updateConnectorParam,
      handleAiScoringToggle,
      handleScheduleFrequencyChange,
      setResumePopoverOpen,
      setRunAfterCreate,
      handleRunAfterCreateClick,
      handleClose,
      getScheduleReviewText,
      getMatchThresholdReviewText,
    },
  };
}
