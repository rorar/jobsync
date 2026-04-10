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
import { deleteWorkExperience } from "@/actions/profile.actions";
import { toast } from "../ui/use-toast";

interface ExperienceCardProps {
  experienceSection: ResumeSection | undefined;
  openDialogForEdit: (id: string) => void;
  openDialogForAdd: () => void;
  resumeId: string;
}

function ExperienceCard({
  experienceSection,
  openDialogForEdit,
  openDialogForAdd,
  resumeId,
}: ExperienceCardProps) {
  const { t, locale } = useTranslations();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [experienceToDelete, setExperienceToDelete] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleDeleteClick = (id: string) => {
    setExperienceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!experienceToDelete) return;
    startTransition(async () => {
      const res = await deleteWorkExperience(experienceToDelete, resumeId);
      if (!res.success) {
        toast({
          variant: "destructive",
          title: t("profile.error"),
          description: res.message,
        });
      }
      setDeleteDialogOpen(false);
      setExperienceToDelete(null);
    });
  };

  return (
    <div>
      <CardTitle className="pl-6 py-3">
        {experienceSection?.sectionTitle}
      </CardTitle>
      <div className="space-y-3">
        {experienceSection?.workExperiences?.map(
          ({
            id,
            jobTitle,
            Company,
            location,
            startDate,
            endDate,
            description,
          }) => (
            <Card key={id}>
              <CardHeader className="p-2 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-xl pl-4">{jobTitle?.label}</CardTitle>
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
                <h3>{Company?.label}</h3>
                <CardDescription>
                  {formatMonthYear(startDate, locale)} -{" "}
                  {endDate ? formatMonthYear(endDate, locale) : t("profile.present")}
                  <br />
                  {location?.label}
                </CardDescription>
                <div className="pt-2">
                  <TipTapContentViewer content={description} />
                </div>
              </CardContent>
            </Card>
          )
        )}
        <button
          onClick={openDialogForAdd}
          className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg py-6 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("profile.addExperience")}
        </button>
      </div>
      <DeleteAlertDialog
        pageTitle={t("profile.deleteExperience")}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDelete={handleDeleteConfirm}
        alertDescription={t("profile.confirmDelete")}
      />
    </div>
  );
}

export default ExperienceCard;
