"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "@/i18n";
import type { AutomationWithResume } from "@/models/automation.model";
import { useAutomationWizard, STEP_KEYS } from "@/components/automations/useAutomationWizard";
import { WizardShell } from "@/components/automations/WizardShell";

interface Resume {
  id: string;
  title: string;
}

interface AutomationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resumes: Resume[];
  onSuccess: () => void;
  editAutomation?: AutomationWithResume | null;
}

export function AutomationWizard({
  open,
  onOpenChange,
  resumes,
  onSuccess,
  editAutomation,
}: AutomationWizardProps) {
  const { t } = useTranslations();

  const wizard = useAutomationWizard({
    open,
    resumes,
    onOpenChange,
    onSuccess,
    editAutomation,
  });

  return (
    <Dialog open={open} onOpenChange={wizard.actions.handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editAutomation
              ? t("automations.editAutomation")
              : t("automations.createAutomation")}
          </DialogTitle>
          <DialogDescription>
            {t("automations.step")} {wizard.state.step + 1} {t("automations.of")}{" "}
            {STEP_KEYS.length}: {t(STEP_KEYS[wizard.state.step].descKey)}
          </DialogDescription>
        </DialogHeader>

        <WizardShell
          wizard={wizard}
          resumes={resumes}
          editResumeTitle={editAutomation?.resume?.title}
        />
      </DialogContent>
    </Dialog>
  );
}
