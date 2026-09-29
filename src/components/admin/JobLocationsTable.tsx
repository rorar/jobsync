"use client";
import { useRef, useState } from "react";
import { DeleteAlertDialog } from "../DeleteAlertDialog";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { JobLocation } from "@/models/job.model";
import { Trash2 } from "lucide-react";
import { AlertDialog } from "@/models/alertDialog.model";
import { toast } from "../ui/use-toast";
import { deleteJobLocationById } from "@/actions/jobLocation.actions";
import { useTranslations } from "@/i18n";

type JobLocationsTableProps = {
  jobLocations: JobLocation[];
  reloadJobLocations: () => void;
};

function JobLocationsTable({
  jobLocations,
  reloadJobLocations,
}: JobLocationsTableProps) {
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
  const onDeleteJobLocation = (location: JobLocation) => {
    if (location._count?.jobsApplied! > 0) {
      setAlert({
        openState: true,
        title: t("admin.appliedJobsExist"),
        description: t("admin.deleteLocationBlocked"),
        deleteAction: false,
      });
    } else {
      setAlert({
        openState: true,
        deleteAction: true,
        itemId: location.id,
      });
    }
  };
  const deleteJobLocation = async (locationId: string) => {
    if (locationId) {
      const { success, message } = await deleteJobLocationById(locationId);
      if (success) {
        toast({
          variant: "success",
          description: t("admin.locationDeleted"),
        });
        reloadJobLocations();
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
            <TableHead>{t("admin.location")}</TableHead>
            <TableHead className="hidden sm:table-cell">
              {t("admin.value")}
            </TableHead>
            <TableHead>{t("admin.jobsApplied")}</TableHead>
            <TableHead>{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobLocations.map((location: JobLocation) => {
            return (
              <TableRow key={location.id}>
                <TableCell className="font-medium">{location.label}</TableCell>
                <TableCell className="font-medium hidden sm:table-cell">
                  {location.value}
                </TableCell>
                <TableCell className="font-medium">
                  {location._count?.jobsApplied}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="text-destructive"
                    data-testid="delete-row"
                    aria-label={t("common.deleteNamed").replace(
                      "{name}",
                      location.label,
                    )}
                    onClick={() => onDeleteJobLocation(location)}
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
        pageTitle={t("admin.deleteTargetLocation")}
        open={alert.openState}
        onOpenChange={() => setAlert({ openState: false, deleteAction: false })}
        onDelete={() => deleteJobLocation(alert.itemId!)}
        alertTitle={alert.title}
        alertDescription={alert.description}
        deleteAction={alert.deleteAction}
        returnFocusTo={tableRef}
      />
    </>
  );
}

export default JobLocationsTable;
