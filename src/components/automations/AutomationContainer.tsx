"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useTranslations } from "@/i18n";
import { getAutomationsList } from "@/actions/automation.actions";
import type { AutomationWithResume } from "@/models/automation.model";
import { AutomationList } from "./AutomationList";
import { AutomationWizard } from "./AutomationWizard";
import Loading from "@/components/Loading";

interface Resume {
  id: string;
  title: string;
}

interface AutomationContainerProps {
  resumes: Resume[];
}

export function AutomationContainer({ resumes }: AutomationContainerProps) {
  const { t } = useTranslations();
  const [automations, setAutomations] = useState<AutomationWithResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editAutomation, setEditAutomation] =
    useState<AutomationWithResume | null>(null);
  const [performanceWarning, setPerformanceWarning] = useState<string | null>(null);

  /** Safely parse a "performanceWarning:<count>" message. Returns localized string or null. */
  const parseWarningMessage = (message?: string): string | null => {
    if (!message) return null;
    const prefix = "performanceWarning:";
    if (!message.startsWith(prefix)) return null;
    const count = message.slice(prefix.length);
    // Return localized warning, never the raw prefix
    return t("automations.performanceWarningBanner").replace("{count}", count);
  };

  const loadAutomations = useCallback(async () => {
    setLoading(true);
    const result = await getAutomationsList();

    if (result.success && result.data) {
      setAutomations(result.data as any);
      // Check for performance warning from server
      const warningMsg = parseWarningMessage(result.message);
      if (warningMsg) {
        setPerformanceWarning(warningMsg);
      } else {
        setPerformanceWarning(null);
      }
    } else {
      toast({
        title: t("automations.validationError"),
        description: result.message || t("automations.somethingWentWrong"),
        variant: "destructive",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAutomations();
  }, [loadAutomations]);

  const handleEdit = (automation: AutomationWithResume) => {
    setEditAutomation(automation);
    setWizardOpen(true);
  };

  const handleWizardClose = (open: boolean) => {
    setWizardOpen(open);
    if (!open) {
      setEditAutomation(null);
    }
  };

  const handleSuccess = () => {
    loadAutomations();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("automations.jobDiscovery")}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={loadAutomations}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setWizardOpen(true)}
              disabled={resumes.length === 0}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("automations.createAutomation")}
            </Button>
          </div>
        </CardHeader>
        {performanceWarning && (
          <div className="mx-6 mb-4 flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{performanceWarning}</span>
          </div>
        )}
        <CardContent>
          {resumes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t("automations.needResume")}</p>
              <p className="text-sm mt-2">
                {t("automations.goToProfile")}
              </p>
            </div>
          ) : loading ? (
            <Loading />
          ) : (
            <AutomationList
              automations={automations}
              onEdit={handleEdit}
              onRefresh={loadAutomations}
            />
          )}
        </CardContent>
      </Card>

      <AutomationWizard
        open={wizardOpen}
        onOpenChange={handleWizardClose}
        resumes={resumes}
        onSuccess={handleSuccess}
        editAutomation={editAutomation}
      />
    </>
  );
}
