"use client";
import { useCallback, useEffect, useState } from "react";
import CreateResume from "./CreateResume";
import ProfilePreferencesCard from "./ProfilePreferencesCard";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { getResumeList } from "@/actions/profile.actions";
import { Resume } from "@/models/profile.model";
import { APP_CONSTANTS } from "@/lib/constants";
import Loading from "../Loading";
import ResumeTable from "./ResumeTable";
import { toast } from "../ui/use-toast";
import { PlusCircle } from "lucide-react";
import { Button } from "../ui/button";
import { RecordsPerPageSelector } from "../RecordsPerPageSelector";
import { RecordsCount } from "../RecordsCount";
import { useTranslations } from "@/i18n";

const ProfileContainer = () => {
  const { t } = useTranslations();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);

  const [resumeToEdit, setResumeToEdit] = useState<Resume | null>(null);
  const [totalResumes, setTotalResumes] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [recordsPerPage, setRecordsPerPage] = useState<number>(
    APP_CONSTANTS.RECORDS_PER_PAGE,
  );

  const loadResumes = useCallback(
    async (page: number) => {
      setLoading(true);
      const { data, total, success, message } = await getResumeList(
        page,
        recordsPerPage,
      );
      if (success && data) {
        setResumes((prev) => (page === 1 ? data : [...prev, ...(data as any[])]) as any);
        setTotalResumes(total ?? 0);
        setPage(page);
        setLoading(false);
      } else {
        setLoading(false);
        return toast({
          variant: "destructive",
          title: t("profile.error"),
          description: message ? t(message) : undefined,
        });
      }
    },
    [recordsPerPage],
  );

  const reloadResumes = useCallback(async () => {
    await loadResumes(1);
  }, [loadResumes]);

  useEffect(() => {
    (async () => await loadResumes(1))();
  }, [loadResumes, recordsPerPage]);

  const createResume = () => {
    setResumeToEdit(null);
    setResumeDialogOpen(true);
  };

  const onEditResume = (resume: Resume) => {
    const _resumeToEdit: Resume = {
      ...resume,
      title: resume.title,
      FileId: resume.FileId,
    };
    setResumeToEdit(_resumeToEdit);
    setResumeDialogOpen(true);
  };

  const setResumeId = (id: string) => {};

  return (
    <div className="space-y-4">
      {/*
        The resume card comes FIRST because its title is the page's name: it is
        rendered as an h1 and every other heading on this page has to sit below
        it. ProfilePreferencesCard opens with an h2, so while it was above, a
        screen-reader user met a section of the page before the page named
        itself. Moving it down is the only fix that neither duplicates the
        title nor invents a second one. See UI-B18 in docs/BUGS.md.
      */}
      <Card>
      <CardHeader className="flex-row justify-between items-center">
        <CardTitle as="h1">{t("profile.title")}</CardTitle>
        <div className="flex items-center">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            onClick={createResume}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              {t("profile.newResume")}
            </span>
          </Button>
          <CreateResume
            resumeDialogOpen={resumeDialogOpen}
            setResumeDialogOpen={setResumeDialogOpen}
            reloadResumes={reloadResumes}
            resumeToEdit={resumeToEdit}
            setNewResumeId={setResumeId}
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading && <Loading />}
        {resumes.length > 0 && (
          <>
            <ResumeTable
              resumes={resumes}
              editResume={onEditResume}
              reloadResumes={reloadResumes}
            />
            <div className="flex items-center justify-between mt-4">
              <RecordsCount
                count={resumes.length}
                total={totalResumes}
                label={t("profile.resumes")}
              />
              {totalResumes > APP_CONSTANTS.RECORDS_PER_PAGE && (
                <RecordsPerPageSelector
                  value={recordsPerPage}
                  onChange={setRecordsPerPage}
                />
              )}
            </div>
          </>
        )}
        {resumes.length < totalResumes && (
          <div className="flex justify-center p-4">
            {/*
              The label stays put: with aria-disabled the button no longer
              vanishes from the focus model when it goes inert, and the
              <Loading /> region above already announces the load.
            */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // aria-disabled keeps the button focusable and in the tab
                // order, so refusing the activation is the handler's job.
                if (loading) return;
                loadResumes(page + 1);
              }}
              aria-disabled={loading}
              className="btn btn-primary aria-disabled:opacity-50"
            >
              {t("profile.loadMore")}
            </Button>
          </div>
        )}
      </CardContent>
      </Card>
      <ProfilePreferencesCard />
    </div>
  );
};

export default ProfileContainer;
