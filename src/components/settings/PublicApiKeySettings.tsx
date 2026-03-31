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
import { Loader2, Plus, Trash2, Copy, Key, AlertTriangle } from "lucide-react";
import {
  createPublicApiKey,
  listPublicApiKeys,
  revokePublicApiKey,
  deletePublicApiKey,
} from "@/actions/publicApiKey.actions";
import type { PublicApiKeyResponse } from "@/models/publicApiKey.model";
import { useTranslations, formatDateCompact } from "@/i18n";

export default function PublicApiKeySettings() {
  const { t, locale } = useTranslations();
  const [keys, setKeys] = useState<PublicApiKeyResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
      const result = await listPublicApiKeys();
      if (result.success && result.data) {
        setKeys(result.data);
      }
    } catch (error) {
      console.error("Error fetching public API keys:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!keyName.trim()) return;
    setCreating(true);
    try {
      const result = await createPublicApiKey(keyName.trim());
      if (result.success && result.data) {
        setNewKey(result.data.key);
        setShowCreateDialog(true);
        setKeyName("");
        await fetchKeys();
      } else {
        toast({
          variant: "destructive",
          title: t("api.createFailed"),
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error creating API key:", error);
      toast({
        variant: "destructive",
        title: t("api.createFailed"),
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevoking(keyId);
    try {
      const result = await revokePublicApiKey(keyId);
      if (result.success) {
        toast({ variant: "success", title: t("api.keyRevoked") });
        await fetchKeys();
      } else {
        toast({
          variant: "destructive",
          title: t("api.revokeFailed"),
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error revoking API key:", error);
    } finally {
      setRevoking(null);
    }
  };

  const handleDelete = async (keyId: string) => {
    setDeleting(keyId);
    try {
      const result = await deletePublicApiKey(keyId);
      if (result.success) {
        toast({ variant: "success", title: t("api.keyDeleted") });
        await fetchKeys();
      } else {
        toast({
          variant: "destructive",
          title: t("api.deleteFailed"),
          description: result.message,
        });
      }
    } catch (error) {
      console.error("Error deleting API key:", error);
    } finally {
      setDeleting(null);
    }
  };

  const handleCopy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast({ variant: "success", title: t("api.keyCopied") });
    } catch {
      // Fallback for non-secure contexts
      const textArea = document.createElement("textarea");
      textArea.value = key;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      toast({ variant: "success", title: t("api.keyCopied") });
    }
  };

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">{t("api.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("api.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">{t("api.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("api.description")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("api.rateLimitInfo")}</p>
      </div>

      {/* Create new key */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("api.createKey")}</CardTitle>
          <CardDescription>{t("api.usageExample")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="api-key-name" className="sr-only">
                {t("api.keyName")}
              </Label>
              <Input
                id="api-key-name"
                placeholder={t("api.keyNamePlaceholder")}
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && keyName.trim()) handleCreate();
                }}
                disabled={creating}
                maxLength={100}
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={!keyName.trim() || creating}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {t("api.createKey")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key list */}
      {keys.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Key className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">{t("api.noKeys")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("api.noKeysDesc")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {activeKeys.map((apiKey) => (
            <KeyRow
              key={apiKey.id}
              apiKey={apiKey}
              locale={locale}
              t={t}
              onRevoke={handleRevoke}
              onDelete={handleDelete}
              revoking={revoking}
              deleting={deleting}
            />
          ))}
          {revokedKeys.length > 0 && (
            <>
              <div className="pt-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  {t("api.revoked")}
                </p>
              </div>
              {revokedKeys.map((apiKey) => (
                <KeyRow
                  key={apiKey.id}
                  apiKey={apiKey}
                  locale={locale}
                  t={t}
                  onRevoke={handleRevoke}
                  onDelete={handleDelete}
                  revoking={revoking}
                  deleting={deleting}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Key created dialog — shows the full key ONCE */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setNewKey(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("api.keyCreated")}</DialogTitle>
            <DialogDescription>{t("api.keyCreatedDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
              <code className="flex-1 text-sm font-mono break-all">
                {newKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => newKey && handleCopy(newKey)}
              >
                <Copy className="h-3 w-3 mr-1" />
                {t("api.copyKey")}
              </Button>
            </div>
            <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t("api.warningOnceVisible")}</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowCreateDialog(false);
                setNewKey(null);
              }}
            >
              {t("api.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Sub-component for each key row ---

function KeyRow({
  apiKey,
  locale,
  t,
  onRevoke,
  onDelete,
  revoking,
  deleting,
}: {
  apiKey: PublicApiKeyResponse;
  locale: string;
  t: (key: string) => string;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
  revoking: string | null;
  deleting: string | null;
}) {
  const isRevoked = !!apiKey.revokedAt;

  return (
    <Card className={isRevoked ? "opacity-60" : ""}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Key className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{apiKey.name}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {apiKey.keyPrefix}{"····"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">
                {t("api.lastUsed")}:{" "}
                {apiKey.lastUsedAt
                  ? formatDateCompact(new Date(apiKey.lastUsedAt), locale)
                  : t("api.never")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("api.created")}:{" "}
                {formatDateCompact(new Date(apiKey.createdAt), locale)}
              </p>
            </div>
            <Badge
              variant={isRevoked ? "destructive" : "default"}
              className={
                isRevoked
                  ? ""
                  : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900"
              }
            >
              {isRevoked ? t("api.revoked") : t("api.active")}
            </Badge>
            {!isRevoked ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={revoking === apiKey.id}
                  >
                    {revoking === apiKey.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      t("api.revokeKey")
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("api.revokeConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("api.revokeConfirmDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onRevoke(apiKey.id)}>
                      {t("api.revokeKey")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={deleting === apiKey.id}
                  >
                    {deleting === apiKey.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("api.deleteConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("api.deleteConfirmDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(apiKey.id)}>
                      {t("api.deleteKey")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
