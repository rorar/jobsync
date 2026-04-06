"use client";
import { ExternalLink, Loader } from "lucide-react";
import { Button } from "../ui/button";
import { useForm } from "react-hook-form";
import { CreateResumeFormSchema } from "@/models/createResumeForm.schema";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Resume } from "@/models/profile.model";
import { toast } from "../ui/use-toast";
import { useTranslations } from "@/i18n";

type CreateResumeProps = {
  resumeDialogOpen: boolean;
  setResumeDialogOpen: (e: boolean) => void;
  resumeToEdit?: Resume | null;
  reloadResumes: () => void;
  setNewResumeId: (id: string) => void;
};

function CreateResume({
  resumeDialogOpen,
  setResumeDialogOpen,
  resumeToEdit,
  reloadResumes,
  setNewResumeId,
}: CreateResumeProps) {
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslations();
  const router = useRouter();
  const shouldOpenAfterSave = useRef(false);

  const pageTitle = resumeToEdit
    ? t("profile.editResumeTitle")
    : t("profile.createResume");

  const form = useForm<z.infer<typeof CreateResumeFormSchema>>({
    resolver: zodResolver(CreateResumeFormSchema),
    mode: "onChange",
    defaultValues: {
      title: "",
    },
  });

  const {
    reset,
    formState: { errors, isValid },
  } = form;

  const closeDialog = () => setResumeDialogOpen(false);

  useEffect(() => {
    reset({
      id: resumeToEdit?.id ?? undefined,
      title: resumeToEdit?.title ?? "",
      fileId: resumeToEdit?.FileId ?? undefined,
    });
  }, [resumeToEdit, reset]);

  const onSubmit = (data: z.infer<typeof CreateResumeFormSchema>) => {
    const formData = new FormData();
    formData.append("file", data.file as File);
    formData.append("title", data.title);
    if (resumeToEdit) {
      formData.append("id", data.id as string);
      if (resumeToEdit.FileId) {
        formData.append("fileId", data.fileId as string);
      }
    }

    startTransition(async () => {
      const res = await fetch("/api/profile/resume", {
        method: "POST",
        body: formData,
      });
      const response = await res.json();
      if (!response.success) {
        toast({
          variant: "destructive",
          title: t("common.error"),
          description: response?.message,
        });
      } else {
        const newId = (response.data as any)?.id;
        reset();
        setResumeDialogOpen(false);
        reloadResumes();
        if (newId) {
          setNewResumeId(newId);
        }
        toast({
          variant: "success",
          description: resumeToEdit
            ? t("profile.resumeUpdated")
            : t("profile.resumeCreated"),
        });
        if (shouldOpenAfterSave.current && newId) {
          router.push(`/dashboard/profile/resume/${newId}`);
        }
        shouldOpenAfterSave.current = false;
      }
    });
  };

  return (
    <Dialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
      <DialogContent className="lg:max-h-screen overflow-y-scroll">
        <DialogHeader>
          <DialogTitle>{pageTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            {resumeToEdit ? t("profile.editResumeDesc") : t("profile.createResumeDesc")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(event) => {
              event.stopPropagation();
              form.handleSubmit(onSubmit)(event);
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 p-2"
          >
            {/* RESUME TITLE */}
            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("profile.resumeTitle")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("profile.resumeTitlePlaceholder")}
                        data-testid="resume-title-input"
                      />
                    </FormControl>
                    <FormMessage>
                      {errors.title && (
                        <span className="text-red-500">
                          {errors.title.message}
                        </span>
                      )}
                    </FormMessage>
                  </FormItem>
                )}
              />
            </div>

            {/* RESUME FILE */}
            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="file"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("profile.uploadResumeOptional")}</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={(e) => {
                          field.onChange(e.target.files?.[0] || null);
                        }}
                      />
                    </FormControl>
                    <FormMessage>
                      {errors.file?.message && (
                        <span className="text-red-500">
                          {errors.file.message}
                        </span>
                      )}
                    </FormMessage>
                  </FormItem>
                )}
              />
            </div>

            <div className="md:col-span-2 mt-4">
              <DialogFooter>
                <div>
                  <Button
                    type="reset"
                    variant="outline"
                    className="mt-2 md:mt-0 w-full"
                    onClick={closeDialog}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
                <Button type="submit" disabled={!isValid}>
                  {t("common.save")}
                  {isPending && <Loader className="h-4 w-4 shrink-0 spinner" />}
                </Button>
                {!resumeToEdit && (
                  <Button
                    type="submit"
                    disabled={!isValid}
                    onClick={() => { shouldOpenAfterSave.current = true; }}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    {t("profile.saveAndOpen")}
                    {isPending && <Loader className="h-4 w-4 shrink-0 spinner" />}
                  </Button>
                )}
              </DialogFooter>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateResume;
