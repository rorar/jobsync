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
import { JobSource } from "@/models/job.model";
import { Trash2 } from "lucide-react";
import { AlertDialog } from "@/models/alertDialog.model";
import { DeleteAlertDialog } from "../DeleteAlertDialog";
import { deleteJobSourceById } from "@/actions/jobSource.actions";
import { toast } from "../ui/use-toast";
import { useTranslations } from "@/i18n";

type JobSourcesTableProps = {
  jobSources: JobSource[];
  reloadJobSources: () => void;
};

function JobSourcesTable({
  jobSources,
  reloadJobSources,
}: JobSourcesTableProps) {
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

  const onDeleteJobSource = (source: JobSource) => {
    if (source._count?.jobsApplied! > 0) {
      setAlert({
        openState: true,
        title: t("admin.appliedJobsExist"),
        description: t("admin.appliedJobsExistDesc"),
        deleteAction: false,
      });
    } else {
      setAlert({
        openState: true,
        deleteAction: true,
        itemId: source.id,
      });
    }
  };

  const deleteJobSource = async (sourceId: string) => {
    if (sourceId) {
      const { success, message } = await deleteJobSourceById(sourceId);
      if (success) {
        toast({
          variant: "success",
          description: t("admin.jobSourceDeleted"),
        });
        reloadJobSources();
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
            <TableHead>{t("admin.source")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("admin.value")}</TableHead>
            <TableHead>{t("admin.jobsApplied")}</TableHead>
            <TableHead>{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobSources.map((source: JobSource) => {
            return (
              <TableRow key={source.id}>
                <TableCell className="font-medium">{source.label}</TableCell>
                <TableCell className="font-medium hidden sm:table-cell">
                  {source.value}
                </TableCell>
                <TableCell className="font-medium">
                  {source._count?.jobsApplied}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="text-destructive"
                    data-testid="delete-row"
                    aria-label={t("common.deleteNamed").replace(
                      "{name}",
                      source.label,
                    )}
                    onClick={() => onDeleteJobSource(source)}
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
        pageTitle={t("admin.deleteTargetSource")}
        open={alert.openState}
        onOpenChange={() => setAlert({ openState: false, deleteAction: false })}
        onDelete={() => deleteJobSource(alert.itemId!)}
        alertTitle={alert.title}
        alertDescription={alert.description}
        deleteAction={alert.deleteAction}
        returnFocusTo={tableRef}
      />
    </>
  );
}

export default JobSourcesTable;
