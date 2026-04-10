"use client";
import { ResumeSection } from "@/models/profile.model";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Edit, Plus, Trash2 } from "lucide-react";
import { TipTapContentViewer } from "../TipTapContentViewer";
import { useTranslations } from "@/i18n";
import { formatMonthYear } from "@/i18n";
import { DeleteAlertDialog } from "../DeleteAlertDialog";
import { useState, useTransition } from "react";
import { deleteEducation } from "@/actions/profile.actions";
import { toast } from "../ui/use-toast";

interface EducationCardProps {
  educationSection: ResumeSection | undefined;
  openDialogForEdit: (id: string) => void;
  openDialogForAdd: () => void;
  resumeId: string;
}

function EducationCard({
  educationSection,
  openDialogForEdit,
  openDialogForAdd,
  resumeId,
}: EducationCardProps) {
  const { sectionTitle, educations } = educationSection!;
  const { t, locale } = useTranslations();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [educationToDelete, setEducationToDelete] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleDeleteClick = (id: string) => {
    setEducationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!educationToDelete) return;
    startTransition(async () => {
      const res = await deleteEducation(educationToDelete, resumeId);
      if (!res.success) {
        toast({
          variant: "destructive",
          title: t("profile.error"),
          description: res.message,
        });
      }
      setDeleteDialogOpen(false);
      setEducationToDelete(null);
    });
  };

  return (
    <div>
      <CardTitle className="pl-6 py-3">{sectionTitle}</CardTitle>
      <div className="space-y-3">
        {educations?.map(
          ({
            id,
            institution,
            degree,
            location,
            fieldOfStudy,
            startDate,
            endDate,
            description,
          }) => (
            <Card key={id}>
              <CardHeader className="p-2 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-xl pl-4">{institution}</CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      onClick={() => openDialogForEdit(id!)}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">
                        {t("profile.edit")}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteClick(id!)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">
                        {t("profile.delete")}
                      </span>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <h3>
                  {degree}, {fieldOfStudy}
                </h3>
                <CardDescription>
                  {formatMonthYear(startDate, locale)} -{" "}
                  {endDate ? formatMonthYear(endDate, locale) : t("profile.present")}
                  <br />
                  {location?.label}
                </CardDescription>
                {description && (
                  <div className="pt-2">
                    <TipTapContentViewer content={description} />
                  </div>
                )}
              </CardContent>
            </Card>
          )
        )}
        <button
          onClick={openDialogForAdd}
          className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg py-6 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("profile.addEducation")}
        </button>
      </div>
      <DeleteAlertDialog
        pageTitle={t("profile.deleteEducation")}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDelete={handleDeleteConfirm}
        alertDescription={t("profile.confirmDelete")}
      />
    </div>
  );
}

export default EducationCard;
