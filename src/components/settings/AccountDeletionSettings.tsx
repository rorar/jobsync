"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useTranslations, formatDateShort } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "@/components/ui/use-toast";
import {
  requestAccountDeletion,
  cancelAccountDeletion,
  getDeletionStatus,
} from "@/actions/account.actions";
import { AlertTriangle, CalendarClock, Loader2 } from "lucide-react";

export default function AccountDeletionSettings() {
  const { t, locale } = useTranslations();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const [deletionScheduledAt, setDeletionScheduledAt] = useState<Date | null>(
    null,
  );
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const result = await getDeletionStatus();
        if (result.success && result.data?.scheduledAt) {
          setDeletionScheduledAt(new Date(result.data.scheduledAt));
        }
      } catch (error) {
        console.error("Error fetching deletion status:", error);
      }
    };
    fetchStatus();
  }, []);

  const handleCancelDeletion = async () => {
    setIsCancelling(true);
    try {
      const result = await cancelAccountDeletion();
      if (result.success) {
        setDeletionScheduledAt(null);
        toast({
          variant: "success",
          title: t("settings.deletionCancelled"),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.deletionCancelFailed"),
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.deletionCancelFailed"),
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    try {
      const result = await requestAccountDeletion();
      if (result.success && result.data) {
        if (result.data.pendingConfirmation) {
          toast({
            title: t("settings.deletionEmailSent"),
            description: t("settings.deletionEmailSentDesc"),
          });
          setOpen(false);
          setConfirmText("");
        } else if (result.data.scheduledAt) {
          setDeletionScheduledAt(new Date(result.data.scheduledAt));
          toast({
            title: t("settings.deletionScheduled"),
            description: t("settings.deletionScheduledDesc").replace(
              "{date}",
              formatDateShort(new Date(result.data.scheduledAt), locale),
            ),
          });
          setOpen(false);
          setConfirmText("");
        } else if (result.data.deleted) {
          toast({
            title: t("settings.deleteAccountSuccess"),
          });
          await signOut({ callbackUrl: "/" });
        }
      } else {
        toast({
          title: t("settings.deleteAccountError"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: t("settings.deleteAccountError"),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const isConfirmed = confirmText === "DELETE";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          {t("settings.dangerZone")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("settings.dangerZoneDesc")}
        </p>
      </div>

      {/* Cooling-off banner */}
      {deletionScheduledAt && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/20">
          <CalendarClock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {t("settings.deletionScheduled")}
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t("settings.deletionScheduledDesc").replace(
                "{date}",
                formatDateShort(deletionScheduledAt, locale),
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelDeletion}
              disabled={isCancelling}
            >
              {isCancelling && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
              )}
              {t("settings.cancelDeletion")}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-destructive/50 p-4">
        <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmText(""); }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              {t("settings.deleteAccount")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("settings.deleteAccountConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings.deleteAccountConfirmDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Label htmlFor="delete-confirm">{t("settings.typeToConfirm")}</Label>
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={t("settings.typeDeletePlaceholder")}
                className="mt-2"
                autoComplete="off"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("settings.deleteAccountCancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={!isConfirmed || isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "..." : t("settings.deleteAccountConfirmButton")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
