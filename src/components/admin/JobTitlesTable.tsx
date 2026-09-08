"use client";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { JobTitle } from "@/models/job.model";
import { Trash2 } from "lucide-react";
import { AlertDialog } from "@/models/alertDialog.model";
import { DeleteAlertDialog } from "../DeleteAlertDialog";
import { deleteJobTitleById } from "@/actions/jobtitle.actions";
import { toast } from "../ui/use-toast";
import { useTranslations } from "@/i18n";

type JobTitlesTableProps = {
  jobTitles: JobTitle[];
  reloadJobTitles: () => void;
};

function JobTitlesTable({ jobTitles, reloadJobTitles }: JobTitlesTableProps) {
  const { t } = useTranslations();
  // A successful delete unmounts the row that holds the button the user pressed,
  // so there is nothing left for Radix to restore focus to and a keyboard user
  // is dropped on document.body. The table survives the delete, so it is the
  // stable landing place; `tabIndex={-1}` lets it take focus programmatically
  // without joining the tab order.
  const tableRef = useRef<HTMLTableElement>(null);
  const [alert, setAlert] = useState<AlertDialog>({
    openState: false,
    deleteAction: false,
  });

  const onDeleteJobTitle = (title: JobTitle) => {
    if (title._count?.jobs! > 0) {
      setAlert({
        openState: true,
        title: t("admin.appliedJobsExist"),
        description: t("admin.deleteJobTitleBlocked"),
        deleteAction: false,
      });
    } else {
      setAlert({
        openState: true,
        deleteAction: true,
        itemId: title.id,
      });
    }
  };
  const deleteJobTitle = async (titleId: string) => {
    if (titleId) {
      const { success, message } = await deleteJobTitleById(titleId);
      if (success) {
        toast({
          variant: "success",
          description: t("admin.jobTitleDeleted"),
        });
        reloadJobTitles();
      } else {
        toast({
          variant: "destructive",
          title: t("common.error"),
          description: message ? t(message) : undefined,
        });
      }
    }
  };

  return (
    <>
      <Table ref={tableRef} tabIndex={-1}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.jobTitle")}</TableHead>
            <TableHead className="hidden sm:table-cell">
              {t("admin.value")}
            </TableHead>
            <TableHead>{t("admin.jobsApplied")}</TableHead>
            <TableHead>{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobTitles.map((title: JobTitle) => {
            return (
              <TableRow key={title.id}>
                <TableCell className="font-medium">{title.label}</TableCell>
                <TableCell className="font-medium hidden sm:table-cell">
                  {title.value}
                </TableCell>
                <TableCell className="font-medium">
                  {title._count?.jobs}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="text-destructive"
                    data-testid="delete-row"
                    aria-label={t("common.deleteNamed").replace(
                      "{name}",
                      title.label,
                    )}
                    onClick={() => onDeleteJobTitle(title)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <DeleteAlertDialog
        pageTitle={t("admin.deleteTargetJobTitle")}
        open={alert.openState}
        onOpenChange={() => setAlert({ openState: false, deleteAction: false })}
        onDelete={() => deleteJobTitle(alert.itemId!)}
        alertTitle={alert.title}
        alertDescription={alert.description}
        deleteAction={alert.deleteAction}
        returnFocusTo={tableRef}
      />
    </>
  );
}

export default JobTitlesTable;
