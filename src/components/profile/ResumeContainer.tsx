"use client";
import { Resume, ResumeSection, SectionType } from "@/models/profile.model";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";
import AddResumeSection, { AddResumeSectionRef } from "./AddResumeSection";
import ContactInfoCard from "./ContactInfoCard";
import { useRef } from "react";
import SummarySectionCard from "./SummarySectionCard";
import ExperienceCard from "./ExperienceCard";
import EducationCard from "./EducationCard";
import AiResumeReviewSection from "./AiResumeReviewSection";
import { DownloadFileButton } from "./DownloadFileButton";
import { FileText } from "lucide-react";
import { useTranslations } from "@/i18n";

function ResumeContainer({ resume }: { resume: Resume }) {
  const resumeSectionRef = useRef<AddResumeSectionRef>(null);
  const { t } = useTranslations();
  const { title, ContactInfo, ResumeSections } = resume ?? {};
  const summarySection = ResumeSections?.find(
    (section) => section.sectionType === SectionType.SUMMARY
  );
  const experienceSection = ResumeSections?.find(
    (section) => section.sectionType === SectionType.EXPERIENCE
  );
  const educationSection = ResumeSections?.find(
    (section) => section.sectionType === SectionType.EDUCATION
  );
  const openContactInfoDialog = () => {
    resumeSectionRef.current?.openContactInfoDialog(ContactInfo!);
  };
  const openSummaryDialogForEdit = () => {
    resumeSectionRef.current?.openSummaryDialog(summarySection!);
  };
  const openExperienceDialogForEdit = (experienceId: string) => {
    const section: ResumeSection = {
      ...experienceSection!,
      workExperiences: experienceSection?.workExperiences?.filter(
        (exp) => exp.id === experienceId
      ),
    };
    resumeSectionRef.current?.openExperienceDialog(section);
  };
  const openExperienceDialogForAdd = () => {
    resumeSectionRef.current?.openExperienceDialogForAdd();
  };
  const openEducationDialogForEdit = (educationId: string) => {
    const section: ResumeSection = {
      ...educationSection!,
      educations: educationSection?.educations?.filter(
        (edu) => edu.id === educationId
      ),
    };
    resumeSectionRef.current?.openEducationDialog(section);
  };
  const openEducationDialogForAdd = () => {
    resumeSectionRef.current?.openEducationDialogForAdd();
  };

  const hasContent = !!(ContactInfo || (ResumeSections && ResumeSections.length > 0));

  return (
    <>
      <Card>
        <CardHeader className="flex-row justify-between items-center">
          <CardTitle>Resume</CardTitle>
          <CardDescription>
            {resume.FileId && resume.File?.filePath
              ? <DownloadFileButton
                  filePath={resume.File.filePath}
                  fileTitle={title}
                  fileName={resume.File.fileName}
                />
              : title}
          </CardDescription>
          <div className="flex items-center">
            <AddResumeSection resume={resume} ref={resumeSectionRef} />
            <AiResumeReviewSection resume={resume} />
          </div>
        </CardHeader>
      </Card>
      {!hasContent && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">{t("profile.startBuilding")}</h3>
          <p className="text-sm mb-4">{t("profile.startBuildingDesc")}</p>
        </div>
      )}
      <div className="space-y-4">
        {ContactInfo && (
          <ContactInfoCard
            contactInfo={ContactInfo}
            openDialog={openContactInfoDialog}
          />
        )}
        {summarySection && (
          <SummarySectionCard
            summarySection={summarySection}
            openDialogForEdit={openSummaryDialogForEdit}
          />
        )}
        {experienceSection && (
          <ExperienceCard
            experienceSection={experienceSection}
            openDialogForEdit={openExperienceDialogForEdit}
            openDialogForAdd={openExperienceDialogForAdd}
            resumeId={resume.id}
          />
        )}
        {educationSection && (
          <EducationCard
            educationSection={educationSection}
            openDialogForEdit={openEducationDialogForEdit}
            openDialogForAdd={openEducationDialogForAdd}
            resumeId={resume.id}
          />
        )}
      </div>
    </>
  );
}

export default ResumeContainer;
