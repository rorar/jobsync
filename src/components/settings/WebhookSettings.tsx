"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Loader2,
  Plus,
  Trash2,
  Copy,
  Webhook,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
} from "@/actions/webhook.actions";
import type { WebhookEndpointDTO } from "@/lib/notifications/types";
import type { NotificationType } from "@/models/notification.model";
import { useTranslations, formatDateCompact } from "@/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ENDPOINTS = 10;

/** All event types that can be subscribed to via webhooks */
const WEBHOOK_EVENT_TYPES: NotificationType[] = [
  "module_deactivated",
  "module_reactivated",
  "module_unreachable",
  "cb_escalation",
  "consecutive_failures",
  "auth_failure",
  "vacancy_promoted",
  "vacancy_batch_staged",
  "bulk_action_completed",
  "retention_completed",
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function WebhookSettings() {
  const { t, locale } = useTranslations();
  const [endpoints, setEndpoints] = useState<WebhookEndpointDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // Create form state
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<NotificationType[]>([]);
  const [creating, setCreating] = useState(false);

  // Secret dialog
  const [showSecretDialog, setShowSecretDialog] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  // Action states
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Expanded endpoint details
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const fetchEndpoints = async () => {
    setIsLoading(true);
    setError(false);
    try {
      const result = await listWebhookEndpoints();
      if (result.success && result.data) {
        setEndpoints(result.data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  /** Client-side URL validation (UX only, server still validates) */
  const validateUrl = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null; // Empty is not an error (just disables submit)
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return t("webhook.urlInvalidProtocol");
      }
    } catch {
      return t("webhook.urlInvalid");
    }
    return null;
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    // Only show error after user has typed something meaningful
    if (value.trim().length > 0) {
      setUrlError(validateUrl(value));
    } else {
      setUrlError(null);
    }
  };

  const handleCreate = async () => {
    if (!url.trim()) return;

    // Client-side URL validation before submit
    const error = validateUrl(url);
    if (error) {
      setUrlError(error);
      return;
    }

    if (selectedEvents.length === 0) {
      toast({
        variant: "destructive",
        title: t("webhook.selectEvents"),
      });
      return;
    }

    setCreating(true);
    try {
      const result = await createWebhookEndpoint(url.trim(), selectedEvents);
      if (result.success && result.data) {
        setNewSecret(result.data.secret);
        setShowSecretDialog(true);
        setUrl("");
        setUrlError(null);
        setSelectedEvents([]);
        await fetchEndpoints();
      } else {
        toast({
          variant: "destructive",
          title: t("webhook.createFailed"),
          description: result.message ? t(result.message) : undefined,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("webhook.createFailed"),
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    setToggling(id);
    try {
      const result = await updateWebhookEndpoint(id, { active });
      if (result.success) {
        toast({
          variant: "success",
          title: t("webhook.updated"),
        });
        await fetchEndpoints();
      } else {
        toast({
          variant: "destructive",
          title: t("webhook.updateFailed"),
          description: result.message ? t(result.message) : undefined,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("webhook.updateFailed"),
      });
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const result = await deleteWebhookEndpoint(id);
      if (result.success) {
        toast({
          variant: "success",
          title: t("webhook.deleted"),
        });
        await fetchEndpoints();
      } else {
        toast({
          variant: "destructive",
          title: t("webhook.deleteFailed"),
          description: result.message ? t(result.message) : undefined,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("webhook.deleteFailed"),
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleCopySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      toast({ variant: "success", title: t("webhook.secretCopied") });
    } catch {
      // Fallback for non-secure contexts
      const textArea = document.createElement("textarea");
      textArea.value = secret;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast({ variant: "success", title: t("webhook.secretCopied") });
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleEvent = (event: NotificationType) => {
    setSelectedEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event],
    );
  };

  const limitReached = endpoints.length >= MAX_ENDPOINTS;

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("webhook.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("webhook.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
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
          <h3 className="text-lg font-medium">{t("webhook.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("webhook.description")}</p>
        </div>
        <div className="text-center py-8">
          <p className="text-destructive">{t("webhook.loadFailed")}</p>
          <Button variant="outline" size="sm" onClick={fetchEndpoints} className="mt-2">
            {t("webhook.retry")}
          </Button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{t("webhook.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("webhook.description")}</p>
      </div>

      {/* Create endpoint form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("webhook.addEndpoint")}</CardTitle>
          <CardDescription>{t("webhook.eventsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* URL input */}
          <div className="space-y-1">
            <Label htmlFor="webhook-url">{t("webhook.urlLabel")}</Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder={t("webhook.urlPlaceholder")}
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              disabled={creating || limitReached}
              maxLength={2048}
              aria-invalid={!!urlError}
              aria-describedby={urlError ? "webhook-url-error" : undefined}
            />
            {urlError && (
              <p id="webhook-url-error" className="text-sm text-destructive">
                {urlError}
              </p>
            )}
          </div>

          {/* Event selection */}
          <div className="space-y-2">
            <Label>{t("webhook.eventsLabel")}</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {WEBHOOK_EVENT_TYPES.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={selectedEvents.includes(event)}
                    onChange={() => toggleEvent(event)}
                    disabled={creating || limitReached}
                  />
                  <span>{t(`webhook.event.${event}`)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Limit warning */}
          {limitReached && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t("webhook.maxReached")}
            </p>
          )}

          {/* Create button */}
          <Button
            onClick={handleCreate}
            disabled={!url.trim() || !!urlError || selectedEvents.length === 0 || creating || limitReached}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none mr-2" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            {t("webhook.addEndpoint")}
          </Button>
        </CardContent>
      </Card>

      {/* Endpoint list */}
      {endpoints.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Webhook className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
            <p className="text-sm font-medium">{t("webhook.noEndpoints")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("webhook.noEndpointsDesc")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {endpoints.map((endpoint) => (
            <EndpointRow
              key={endpoint.id}
              endpoint={endpoint}
              locale={locale}
              t={t}
              isExpanded={expanded.has(endpoint.id)}
              onToggleExpand={() => toggleExpanded(endpoint.id)}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
              toggling={toggling}
              deleting={deleting}
            />
          ))}
        </div>
      )}

      {/* Secret created dialog */}
      <Dialog
        open={showSecretDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowSecretDialog(false);
            setNewSecret(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("webhook.secretCreatedTitle")}</DialogTitle>
            <DialogDescription>{t("webhook.secretCreatedDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("webhook.secretLabel")}</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
                <code className="flex-1 text-sm font-mono break-all" aria-describedby="webhook-secret-warning">
                  {newSecret}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => newSecret && handleCopySecret(newSecret)}
                >
                  <Copy className="h-3 w-3 mr-1" aria-hidden="true" />
                  {t("webhook.copySecret")}
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2 text-sm text-orange-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span id="webhook-secret-warning">{t("webhook.secretWarning")}</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowSecretDialog(false);
                setNewSecret(null);
              }}
            >
              {t("webhook.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EndpointRow — Sub-component for each endpoint card
// ---------------------------------------------------------------------------

function EndpointRow({
  endpoint,
  locale,
  t,
  isExpanded,
  onToggleExpand,
  onToggleActive,
  onDelete,
  toggling,
  deleting,
}: {
  endpoint: WebhookEndpointDTO;
  locale: string;
  t: (key: string) => string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  toggling: string | null;
  deleting: string | null;
}) {
  const truncatedUrl =
    endpoint.url.length > 50
      ? endpoint.url.slice(0, 47) + "..."
      : endpoint.url;

  return (
    <Card className={!endpoint.active ? "opacity-60" : ""}>
      <CardContent className="py-3 px-4">
        {/* Compact row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Webhook className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-mono truncate" title={endpoint.url}>
                {truncatedUrl}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-xs">
                  {t("webhook.eventsCount").replace("{count}", String(endpoint.events.length))}
                </Badge>
                {endpoint.failureCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {t("webhook.failureCount").replace("{count}", String(endpoint.failureCount))}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Created date (hidden on mobile) */}
            <span className="text-xs text-muted-foreground hidden sm:block">
              {formatDateCompact(new Date(endpoint.createdAt), locale)}
            </span>

            {/* Active toggle */}
            <Switch
              checked={endpoint.active}
              onCheckedChange={(checked) => onToggleActive(endpoint.id, checked)}
              disabled={toggling === endpoint.id}
              aria-label={endpoint.active ? t("webhook.active") : t("webhook.inactive")}
            />

            {/* Expand/collapse */}
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleExpand}
              aria-label={isExpanded ? t("webhook.hideDetails") : t("webhook.showDetails")}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>

            {/* Delete button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={deleting === endpoint.id}
                  aria-label={t("common.delete")}
                >
                  {deleting === endpoint.id ? (
                    <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("webhook.deleteConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("webhook.deleteConfirmDesc")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(endpoint.id)}>
                    {t("common.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t space-y-2">
            {/* Full URL */}
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">{t("webhook.urlLabel")}</Label>
              <p className="text-sm font-mono break-all">{endpoint.url}</p>
            </div>

            {/* Subscribed events */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("webhook.subscribedEvents")}</Label>
              <div className="flex flex-wrap gap-1">
                {endpoint.events.map((event) => (
                  <Badge key={event} variant="outline" className="text-xs">
                    {t(`webhook.event.${event}`)}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Failure count */}
            <div className="space-y-0.5">
              <Label className="text-xs text-muted-foreground">{t("webhook.failureCount").replace("{count}", "")}</Label>
              <p className="text-sm">
                {endpoint.failureCount > 0
                  ? t("webhook.failureCount").replace("{count}", String(endpoint.failureCount))
                  : t("webhook.noFailures")}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
