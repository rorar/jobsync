"use client";
import { useState } from "react";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { ActivityType } from "@/models/activity.model";
import { Trash2 } from "lucide-react";
import { AlertDialog } from "@/models/alertDialog.model";
import { DeleteAlertDialog } from "../DeleteAlertDialog";
import { deleteActivityTypeById } from "@/actions/activity.actions";
import { toast } from "../ui/use-toast";
import { useTranslations } from "@/i18n";

type ActivityTypesTableProps = {
  activityTypes: ActivityType[];
  reloadActivityTypes: () => void;
};

function ActivityTypesTable({
  activityTypes,
  reloadActivityTypes,
}: ActivityTypesTableProps) {
  const { t } = useTranslations();
  const [alert, setAlert] = useState<AlertDialog>({
    openState: false,
    deleteAction: false,
  });

  const onDeleteActivityType = (activityType: ActivityType) => {
    const activityCount = activityType._count?.Activities ?? 0;
    const taskCount = activityType._count?.Tasks ?? 0;

    // An activity cannot exist without a type — Activity.activityTypeId is NOT
    // NULL with ON DELETE RESTRICT — so this delete is impossible, not merely
    // discouraged. Cancel-only dialog that says why.
    if (activityCount > 0) {
      setAlert({
        openState: true,
        title: t("admin.activityTypeInUse"),
        description: t("admin.activityTypeInUseDesc"),
        deleteAction: false,
      });
      return;
    }

    // Task.activityTypeId is nullable with ON DELETE SET NULL, so tasks that
    // reference this type survive the delete but silently lose their type.
    // That is legal and intended, and the confirm dialog has to say so.
    setAlert({
      openState: true,
      deleteAction: true,
      itemId: activityType.id,
      title: t("admin.deleteActivityTypeTitle"),
      description:
        taskCount > 0
          ? t("admin.unlinkTasksWarning").replace("{count}", String(taskCount))
          : t("admin.deleteActivityTypeDesc"),
    });
  };

  const deleteActivityType = async (activityTypeId: string | undefined) => {
    if (!activityTypeId) return;
    const { success, message } = await deleteActivityTypeById(activityTypeId);
    if (success) {
      toast({
        variant: "success",
        description: t("admin.activityTypeDeleted"),
      });
      reloadActivityTypes();
    } else {
      toast({
        variant: "destructive",
        title: t("common.error"),
        description: message ? t(message) : undefined,
      });
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.activityType")}</TableHead>
            <TableHead className="hidden sm:table-cell">
              {t("admin.value")}
            </TableHead>
            <TableHead>{t("admin.numActivities")}</TableHead>
            <TableHead>{t("admin.numTasks")}</TableHead>
            <TableHead>{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activityTypes.map((activityType: ActivityType) => (
            <TableRow key={activityType.id}>
              <TableCell className="font-medium">
                {activityType.label}
              </TableCell>
              <TableCell className="font-medium hidden sm:table-cell">
                {activityType.value}
              </TableCell>
              <TableCell className="font-medium">
                {activityType._count?.Activities ?? 0}
              </TableCell>
              <TableCell className="font-medium">
                {activityType._count?.Tasks ?? 0}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="text-destructive"
                  aria-label={t("common.delete")}
                  onClick={() => onDeleteActivityType(activityType)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">{t("common.delete")}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/*
        Both branches set alertTitle explicitly, so pageTitle is never read
        here. It stays only because the prop is required; the default it feeds
        interpolates an untranslated English noun into the accessible name.
      */}
      <DeleteAlertDialog
        pageTitle="activity type"
        open={alert.openState}
        onOpenChange={() => setAlert({ openState: false, deleteAction: false })}
        onDelete={() => deleteActivityType(alert.itemId)}
        alertTitle={alert.title}
        alertDescription={alert.description}
        deleteAction={alert.deleteAction}
      />
    </>
  );
}

export default ActivityTypesTable;
