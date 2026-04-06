"use client";
import { useTransition, useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  AlertCircle,
  CheckCircle,
  ImageIcon,
  Loader,
  Loader2,
  PlusCircle,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { AddCompanyFormSchema } from "@/models/addCompanyForm.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { toast } from "../ui/use-toast";
import { addCompany, updateCompany } from "@/actions/company.actions";
import { checkLogoUrl } from "@/actions/logoCheck.actions";
import { Company } from "@/models/job.model";
import { useTranslations } from "@/i18n";
import {
  getLogoAssetForCompany,
  deleteLogoAsset,
  triggerLogoDownload,
} from "@/actions/logoAsset.actions";
import type { LogoAssetInfo } from "@/actions/logoAsset.actions";
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
} from "../ui/alert-dialog";

/** Supported image file extensions for company logo URLs. */
const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
];

/**
 * Checks whether the given string is a plausible image URL.
 * Accepts any http/https URL — the preview will attempt to load it
 * and show an error state if it's not a valid image.
 * This is intentionally permissive: many valid image URLs don't end
 * in a file extension (CDN URLs, Wikipedia, API-served images).
 */
function isPlausibleImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    // Accept relative paths (e.g., /icons/logo.svg)
    return url.startsWith("/");
  }
}

/**
 * Logo preview component that renders a live preview of the company logo URL.
 * Handles loading, error, and empty states gracefully.
 * SVG URLs are rendered via a standard <img> tag which handles them correctly.
 *
 * NOTE: File upload integration point — when implementing file upload (future),
 * add an upload dropzone/button here alongside the URL input. The uploaded file
 * URL would then be set into the logoUrl form field. Accepted MIME types for
 * upload: image/png, image/jpeg, image/gif, image/webp, image/svg+xml, image/x-icon.
 */
function LogoPreview({
  url,
  alt,
  noPreviewLabel,
  invalidUrlLabel,
  notImageLabel,
  onResolvedUrl,
}: {
  url: string | undefined;
  alt: string;
  noPreviewLabel: string;
  invalidUrlLabel: string;
  notImageLabel: string;
  onResolvedUrl?: (resolvedUrl: string) => void;
}) {
  const [imgStatus, setImgStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [serverContentType, setServerContentType] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setImgStatus("idle");
      setServerContentType(null);
      setResolvedUrl(null);
      return;
    }
    if (!isPlausibleImageUrl(url)) {
      setImgStatus("error");
      return;
    }
    setImgStatus("loading");
    setServerContentType(null);
    setResolvedUrl(null);

    // Check content-type server-side in parallel with <img> load.
    // Also resolves Wikipedia media page URLs to direct Wikimedia image URLs.
    let cancelled = false;
    checkLogoUrl(url).then((result) => {
      if (cancelled) return;
      if (result.resolvedUrl) {
        setResolvedUrl(result.resolvedUrl);
        // Auto-apply the resolved URL
        onResolvedUrl?.(result.resolvedUrl);
      } else if (!result.isImage && result.contentType) {
        setServerContentType(result.contentType);
      }
    });
    return () => { cancelled = true; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps -- onResolvedUrl is stable

  const handleLoad = useCallback(() => setImgStatus("loaded"), []);
  const handleError = useCallback(() => setImgStatus("error"), []);

  // No URL — show placeholder
  if (!url) {
    return (
      <div className="flex items-center justify-center w-full h-24 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30">
        <div className="flex flex-col items-center gap-1 text-muted-foreground text-sm">
          <ImageIcon className="h-6 w-6" />
          <span>{noPreviewLabel}</span>
        </div>
      </div>
    );
  }

  // URL present but unsupported or image failed to load
  if (imgStatus === "error") {
    const isNotImage = serverContentType?.startsWith("text/");
    return (
      <div className="flex items-center justify-center w-full h-24 rounded-md border border-dashed border-destructive/40 bg-destructive/5">
        <div className="flex flex-col items-center gap-1 text-destructive text-sm text-center px-4">
          <ImageIcon className="h-6 w-6" />
          <span>{isNotImage ? notImageLabel : invalidUrlLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center w-full h-24 rounded-md border border-dashed border-muted-foreground/40 bg-muted/10 overflow-hidden">
      {imgStatus === "loading" && (
        <Loader className="h-5 w-5 animate-spin motion-reduce:animate-none text-muted-foreground" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        className={`max-h-20 max-w-[200px] object-contain ${imgStatus === "loading" ? "hidden" : ""}`}
      />
    </div>
  );
}

/**
 * Displays the cached logo asset status for a company in edit mode.
 * Shows ready/pending/failed states with appropriate actions.
 */
function LogoAssetStatus({
  companyId,
  onAssetDeleted,
}: {
  companyId: string;
  onAssetDeleted: () => void;
}) {
  const { t } = useTranslations();
  const [asset, setAsset] = useState<LogoAssetInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [redownloading, setRedownloading] = useState(false);

  const fetchAsset = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getLogoAssetForCompany(companyId);
      if (result.success) {
        setAsset(result.data ?? null);
      }
    } catch {
      // Silently fail — section just won't show
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  // Poll for pending status
  useEffect(() => {
    if (asset?.status !== "pending") return;
    const interval = setInterval(fetchAsset, 3000);
    return () => clearInterval(interval);
  }, [asset?.status, fetchAsset]);

  const handleDelete = async () => {
    if (!asset) return;
    setDeleting(true);
    try {
      const result = await deleteLogoAsset(asset.id);
      if (result.success) {
        setAsset(null);
        onAssetDeleted();
        toast({
          variant: "success",
          description: t("logoAsset.deleted"),
        });
      } else {
        toast({
          variant: "destructive",
          description: t("logoAsset.deleteFailed"),
        });
      }
    } catch {
      toast({
        variant: "destructive",
        description: t("logoAsset.deleteFailed"),
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleRedownload = async () => {
    setRedownloading(true);
    try {
      const result = await triggerLogoDownload(companyId);
      if (result.success) {
        toast({
          variant: "success",
          description: t("logoAsset.redownloadStarted"),
        });
        // Refetch to get the new pending status
        await fetchAsset();
      } else {
        toast({
          variant: "destructive",
          description: t("logoAsset.redownloadFailed"),
        });
      }
    } catch {
      toast({
        variant: "destructive",
        description: t("logoAsset.redownloadFailed"),
      });
    } finally {
      setRedownloading(false);
    }
  };

  // Don't render anything while loading or when no asset exists
  if (loading || !asset) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  // Ready state
  if (asset.status === "ready") {
    return (
      <div className="flex items-start gap-3 p-3 rounded-md border border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
        <CheckCircle className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            {t("logoAsset.statusReady")}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>{t("logoAsset.fileSize")}: {formatFileSize(asset.fileSize)}</span>
            {asset.width && asset.height && (
              <span>{t("logoAsset.dimensions")}: {asset.width} x {asset.height}px</span>
            )}
            <span>{t("logoAsset.mimeType")}: {asset.mimeType}</span>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-destructive hover:text-destructive"
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("logoAsset.deleteConfirm")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Pending state
  if (asset.status === "pending") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
        <Loader2 className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-spin motion-reduce:animate-none shrink-0" />
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
          {t("logoAsset.statusPending")}
        </p>
      </div>
    );
  }

  // Failed state
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border border-destructive/30 bg-destructive/5">
      <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-destructive">
          {t("logoAsset.statusFailed")}
        </p>
        {asset.errorMessage && (
          <p className="text-xs text-muted-foreground">
            {t("logoAsset.errorPrefix")}: {asset.errorMessage}
          </p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={handleRedownload}
        disabled={redownloading}
      >
        {redownloading ? (
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin motion-reduce:animate-none" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
        )}
        {t("logoAsset.redownload")}
      </Button>
    </div>
  );
}

type AddCompanyProps = {
  reloadCompanies: () => void;
  editCompany?: Company | null;
  resetEditCompany: () => void;
  dialogOpen: boolean;
  setDialogOpen: (e: boolean) => void;
};

function AddCompany({
  reloadCompanies,
  editCompany,
  resetEditCompany,
  dialogOpen,
  setDialogOpen,
}: AddCompanyProps) {
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslations();

  const pageTitle = editCompany ? t("admin.editCompany") : t("admin.addCompany");

  const form = useForm<z.infer<typeof AddCompanyFormSchema>>({
    resolver: zodResolver(AddCompanyFormSchema),
    defaultValues: {
      company: "",
      logoUrl: "",
      id: undefined,
      createdBy: undefined,
    },
  });

  const { reset, formState } = form;

  useEffect(() => {
    if (editCompany) {
      reset(
        {
          id: editCompany?.id,
          company: editCompany?.label ?? "",
          createdBy: editCompany?.createdBy,
          logoUrl: editCompany?.logoUrl ?? "",
        },
        { keepDefaultValues: true },
      );
    }
  }, [editCompany, reset]);

  const addCompanyForm = () => {
    if (!editCompany) {
      reset();
      resetEditCompany();
    }
    setDialogOpen(true);
  };

  const closeDialog = () => setDialogOpen(false);

  const onSubmit = (data: z.infer<typeof AddCompanyFormSchema>) => {
    startTransition(async () => {
      const res = editCompany
        ? await updateCompany(data)
        : await addCompany(data);
      if (!res?.success) {
        toast({
          variant: "destructive",
          title: t("common.error"),
          description: res?.message,
        });
      } else {
        reset();
        setDialogOpen(false);
        reloadCompanies();
        toast({
          variant: "success",
          description: editCompany
            ? t("admin.companyUpdated")
            : t("admin.companyCreated"),
        });
      }
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1"
        onClick={addCompanyForm}
        data-testid="add-company-btn"
      >
        <PlusCircle className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
          {t("admin.newCompany")}
        </span>
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="lg:max-h-screen overflow-y-scroll">
          <DialogHeader>
            <DialogTitle>{pageTitle}</DialogTitle>
            <DialogDescription className="text-primary">
              {t("admin.editCompanyWarning")}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 p-2"
            >
              {/* COMPANY NAME */}
              <div className="md:col-span-2">
                <FormField
                  control={form.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.companyName")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* COMPANY LOGO URL */}
              <div className="md:col-span-2">
                <FormField
                  control={form.control}
                  name="logoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("admin.companyLogoUrl")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t("admin.companyLogoUrlPlaceholder")}
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground">
                        {t("admin.companyLogoUrlHint")}
                      </p>
                    </FormItem>
                  )}
                />
              </div>

              {/* LOGO PREVIEW */}
              <div className="md:col-span-2">
                <p className="text-sm font-medium mb-2">
                  {t("admin.companyLogoPreview")}
                </p>
                <LogoPreview
                  url={form.watch("logoUrl")}
                  alt={form.watch("company") || "Company logo"}
                  noPreviewLabel={t("admin.companyLogoNoPreview")}
                  invalidUrlLabel={t("admin.companyLogoInvalidUrl")}
                  notImageLabel={t("admin.companyLogoNotImage")}
                  onResolvedUrl={async (resolved) => {
                    form.setValue("logoUrl", resolved, { shouldDirty: true });
                    // Auto-save for existing companies so the logo updates everywhere
                    if (editCompany?.id) {
                      const data = form.getValues();
                      const res = await updateCompany({ ...data, logoUrl: resolved });
                      if (res?.success) {
                        reloadCompanies();
                        toast({
                          variant: "success",
                          title: t("admin.companyLogoResolved"),
                          description: t("admin.companyLogoResolvedAutoSaved"),
                        });
                        return;
                      }
                    }
                    toast({
                      variant: "success",
                      title: t("admin.companyLogoResolved"),
                      description: t("admin.companyLogoResolvedDesc"),
                    });
                  }}
                />
                {/* TODO: File upload integration point — add upload dropzone/button here */}

                {/* CACHED LOGO STATUS — only in edit mode */}
                {editCompany?.id && (
                  <div className="mt-3">
                    <LogoAssetStatus
                      companyId={editCompany.id}
                      onAssetDeleted={reloadCompanies}
                    />
                  </div>
                )}
              </div>
              <div className="md:col-span-2 mt-4">
                <DialogFooter
                // className="md:col-span
                >
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
                  <Button type="submit" disabled={!formState.isDirty}>
                    {t("common.save")}
                    {isPending && (
                      <Loader className="h-4 w-4 shrink-0 spinner" />
                    )}
                  </Button>
                </DialogFooter>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AddCompany;
