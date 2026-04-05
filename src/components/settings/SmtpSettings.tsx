"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { toast } from "../ui/use-toast";
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
import {
  Loader2,
  Mail,
  Save,
  Send,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  saveSmtpConfig,
  getSmtpConfig,
  testSmtpConnection,
  deleteSmtpConfig,
} from "@/actions/smtp.actions";
import { useTranslations } from "@/i18n";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SmtpFormData {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  tlsRequired: boolean;
  active: boolean;
}

const INITIAL_FORM: SmtpFormData = {
  host: "",
  port: 587,
  username: "",
  password: "",
  fromAddress: "",
  tlsRequired: true,
  active: true,
};

const TEST_COOLDOWN_SECONDS = 60;

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SmtpSettings() {
  const { t } = useTranslations();

  // Config state
  const [hasConfig, setHasConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [form, setForm] = useState<SmtpFormData>(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [passwordMask, setPasswordMask] = useState("");

  // Action states
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Test cooldown
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------------------
  // Fetch config
  // -------------------------------------------------------------------------

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const result = await getSmtpConfig();
      if (result.success && result.data) {
        setHasConfig(true);
        setForm({
          host: result.data.host,
          port: result.data.port,
          username: result.data.username,
          password: "", // Never returned from server
          fromAddress: result.data.fromAddress,
          tlsRequired: result.data.tlsRequired,
          active: result.data.active,
        });
        setHasExistingPassword(true);
        setPasswordMask(result.data.passwordMask ?? "");
        setIsEditing(false);
      } else if (result.success) {
        // No config exists yet
        setHasConfig(false);
        setForm(INITIAL_FORM);
        setHasExistingPassword(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Clean up cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Cooldown management
  // -------------------------------------------------------------------------

  const startCooldown = () => {
    setCooldown(TEST_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // -------------------------------------------------------------------------
  // Form helpers
  // -------------------------------------------------------------------------

  const updateField = <K extends keyof SmtpFormData>(
    key: K,
    value: SmtpFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const isFormValid = (): boolean => {
    if (!form.host.trim()) return false;
    if (!form.username.trim()) return false;
    if (!form.fromAddress.trim()) return false;
    if (form.port < 1 || form.port > 65535) return false;
    // Password required for new config or if user typed a new one
    if (!hasExistingPassword && !form.password) return false;
    return true;
  };

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isFormValid()) return;
    setSaving(true);
    try {
      const result = await saveSmtpConfig({
        host: form.host.trim(),
        port: form.port,
        username: form.username.trim(),
        password: form.password || undefined, // Only send if changed
        fromAddress: form.fromAddress.trim(),
        tlsRequired: form.tlsRequired,
        active: form.active,
      });
      if (result.success) {
        toast({ variant: "success", title: t("settings.smtpSaved") });
        await fetchConfig();
      } else {
        toast({
          variant: "destructive",
          title: t("settings.smtpSaveFailed"),
          description: result.message ? t(result.message) : undefined,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.smtpSaveFailed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await testSmtpConnection();
      if (result.success) {
        toast({ variant: "success", title: t("settings.smtpTestSuccess") });
      } else {
        toast({
          variant: "destructive",
          title: t("settings.smtpTestFailed"),
          description: result.message ? t(result.message) : undefined,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.smtpTestFailed"),
      });
    } finally {
      setTesting(false);
      startCooldown();
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteSmtpConfig();
      if (result.success) {
        toast({ variant: "success", title: t("settings.smtpDeleted") });
        setHasConfig(false);
        setForm(INITIAL_FORM);
        setHasExistingPassword(false);
        setPasswordMask("");
        setIsEditing(false);
      } else {
        toast({
          variant: "destructive",
          title: t("settings.smtpDeleteFailed"),
          description: result.message ? t(result.message) : undefined,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("settings.smtpDeleteFailed"),
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSetup = () => {
    setIsEditing(true);
    setForm(INITIAL_FORM);
    setHasExistingPassword(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
    setShowPassword(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setShowPassword(false);
    // Restore from server state
    fetchConfig();
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("settings.smtpTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.smtpDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Loader2
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("settings.smtpTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.smtpDescription")}
          </p>
        </div>
        <div className="text-center py-8" role="alert">
          <p className="text-destructive">{t("settings.smtpLoadFailed")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConfig}
            className="mt-2"
          >
            {t("settings.errorTryAgain")}
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Empty state — no config
  // -------------------------------------------------------------------------

  if (!hasConfig && !isEditing) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("settings.smtpTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings.smtpDescription")}
          </p>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <Mail
              className="h-8 w-8 mx-auto text-muted-foreground mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">
              {t("settings.smtpNoConfig")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("settings.smtpNoConfigDesc")}
            </p>
            <Button onClick={handleSetup} className="mt-4">
              <Mail className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("settings.smtpSetup")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Config form (create + edit)
  // -------------------------------------------------------------------------

  const showForm = isEditing || !hasConfig;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{t("settings.smtpTitle")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("settings.smtpDescription")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("settings.smtpTitle")}
          </CardTitle>
          <CardDescription>{t("settings.smtpDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4" method="POST" action="">
            {/* Host + Port row */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
              <div className="space-y-1">
                <Label htmlFor="smtp-host">{t("settings.smtpHost")}</Label>
                <Input
                  id="smtp-host"
                  type="text"
                  placeholder={t("settings.smtpHostPlaceholder")}
                  value={form.host}
                  onChange={(e) => updateField("host", e.target.value)}
                  disabled={!showForm || saving}
                  required
                  aria-required="true"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="smtp-port">{t("settings.smtpPort")}</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(e) =>
                    updateField("port", parseInt(e.target.value, 10) || 587)
                  }
                  disabled={!showForm || saving}
                  required
                  aria-required="true"
                />
              </div>
            </div>

            {/* Username */}
            <div className="space-y-1">
              <Label htmlFor="smtp-username">
                {t("settings.smtpUsername")}
              </Label>
              <Input
                id="smtp-username"
                type="text"
                value={form.username}
                onChange={(e) => updateField("username", e.target.value)}
                disabled={!showForm || saving}
                autoComplete="username"
                required
                aria-required="true"
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Label htmlFor="smtp-password">
                {t("settings.smtpPassword")}
              </Label>
              {showForm ? (
                <div className="relative">
                  <Input
                    id="smtp-password"
                    type={showPassword ? "text" : "password"}
                    placeholder={
                      hasExistingPassword
                        ? t("settings.smtpPasswordNew")
                        : undefined
                    }
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    disabled={saving}
                    autoComplete="current-password"
                    className="pr-10"
                    required={!hasExistingPassword}
                    aria-required={!hasExistingPassword ? "true" : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t("settings.smtpHidePassword") : t("settings.smtpShowPassword")}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  {passwordMask || t("settings.smtpPasswordMask")}
                </p>
              )}
            </div>

            {/* From Address */}
            <div className="space-y-1">
              <Label htmlFor="smtp-from">
                {t("settings.smtpFromAddress")}
              </Label>
              <Input
                id="smtp-from"
                type="email"
                placeholder={t("settings.smtpFromAddressPlaceholder")}
                value={form.fromAddress}
                onChange={(e) => updateField("fromAddress", e.target.value)}
                disabled={!showForm || saving}
                required
                aria-required="true"
              />
            </div>

            {/* TLS Required switch */}
            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="smtp-tls" className="text-sm font-medium">
                  {t("settings.smtpTlsRequired")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.smtpTlsDesc")}
                </p>
              </div>
              <Switch
                id="smtp-tls"
                checked={form.tlsRequired}
                onCheckedChange={(checked) =>
                  updateField("tlsRequired", checked)
                }
                disabled={!showForm || saving}
              />
            </div>

            {/* Active switch */}
            <div className="flex items-center justify-between rounded-md border px-4 py-3">
              <div className="space-y-0.5">
                <Label htmlFor="smtp-active" className="text-sm font-medium">
                  {t("settings.smtpActive")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("settings.smtpActiveDesc")}
                </p>
              </div>
              <Switch
                id="smtp-active"
                checked={form.active}
                onCheckedChange={(checked) => updateField("active", checked)}
                disabled={!showForm || saving}
              />
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              {showForm ? (
                <>
                  {/* Save */}
                  <Button
                    type="submit"
                    disabled={!isFormValid() || saving}
                  >
                    {saving ? (
                      <Loader2
                        className="h-4 w-4 animate-spin motion-reduce:animate-none mr-2"
                        aria-hidden="true"
                      />
                    ) : (
                      <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                    )}
                    {saving
                      ? t("settings.smtpSaving")
                      : t("settings.smtpSave")}
                  </Button>

                  {/* Cancel (only when editing existing config) */}
                  {hasConfig && (
                    <Button type="button" variant="outline" onClick={handleCancelEdit}>
                      {t("settings.cancel")}
                    </Button>
                  )}
                </>
              ) : (
                <>
                  {/* Edit */}
                  <Button type="button" variant="outline" onClick={handleEdit} disabled={testing}>
                    {t("settings.smtpEdit")}
                  </Button>

                  {/* Test email */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTest}
                    disabled={testing || cooldown > 0}
                  >
                    {testing ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin motion-reduce:animate-none mr-2"
                          aria-hidden="true"
                        />
                        {t("settings.smtpTestingConnection")}
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                        {cooldown > 0
                          ? <span aria-live="polite">{t("settings.smtpTestCooldown").replace(
                              "{seconds}",
                              String(cooldown),
                            )}</span>
                          : t("settings.smtpTestEmail")}
                      </>
                    )}
                  </Button>

                  {/* Delete */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={deleting || testing}
                      >
                        {deleting ? (
                          <Loader2
                            className="h-4 w-4 animate-spin motion-reduce:animate-none mr-2"
                            aria-hidden="true"
                          />
                        ) : (
                          <Trash2
                            className="h-4 w-4 mr-2"
                            aria-hidden="true"
                          />
                        )}
                        {t("settings.smtpDelete")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("settings.smtpDeleteConfirm")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("settings.smtpDeleteConfirmDesc")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t("settings.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                          {t("settings.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
