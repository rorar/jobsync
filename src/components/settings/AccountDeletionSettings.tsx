"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "@/i18n";
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
import { deleteAccount } from "@/actions/account.actions";
import { AlertTriangle } from "lucide-react";

export default function AccountDeletionSettings() {
  const { t } = useTranslations();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const isConfirmed = confirmText === "DELETE";

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    try {
      const result = await deleteAccount();
      if (result.success) {
        toast({
          title: t("settings.deleteAccountSuccess"),
        });
        await signOut({ callbackUrl: "/" });
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
