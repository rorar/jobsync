"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "../ui/use-toast";
import { Ban, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "@/i18n";
import {
  getBlacklistEntries,
  addBlacklistEntry,
  removeBlacklistEntry,
} from "@/actions/companyBlacklist.actions";
import type {
  CompanyBlacklist,
  BlacklistMatchType,
} from "@/models/companyBlacklist.model";

const MATCH_TYPE_KEYS: Record<BlacklistMatchType, string> = {
  exact: "blacklist.matchExact",
  contains: "blacklist.matchContains",
  starts_with: "blacklist.matchStartsWith",
  ends_with: "blacklist.matchEndsWith",
};

export default function CompanyBlacklistSettings() {
  const { t } = useTranslations();
  const [entries, setEntries] = useState<CompanyBlacklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [pattern, setPattern] = useState("");
  const [matchType, setMatchType] = useState<BlacklistMatchType>("contains");
  const [reason, setReason] = useState("");

  const loadEntries = useCallback(async () => {
    const result = await getBlacklistEntries();
    if (result.success && result.data) {
      setEntries(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handleAdd() {
    if (!pattern.trim()) {
      toast({ title: t("blacklist.patternRequired"), variant: "destructive" });
      return;
    }

    setAdding(true);
    const result = await addBlacklistEntry(pattern, matchType, reason);
    setAdding(false);

    if (result.success) {
      toast({ title: t("blacklist.added") });
      setPattern("");
      setReason("");
      setMatchType("contains");
      loadEntries();
    } else {
      toast({
        title: result.message ? t(result.message) : t("common.error"),
        variant: "destructive",
      });
    }
  }

  async function handleRemove(id: string) {
    const result = await removeBlacklistEntry(id);
    if (result.success) {
      toast({ title: t("blacklist.removed") });
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } else {
      toast({ title: t("common.error"), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("blacklist.title")}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("blacklist.description")}
        </p>
      </div>

      {/* Add new entry form */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="blacklist-pattern">{t("blacklist.pattern")}</Label>
            <Input
              id="blacklist-pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={t("blacklist.patternPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="blacklist-match-type">{t("blacklist.matchType")}</Label>
            <Select
              value={matchType}
              onValueChange={(v) => setMatchType(v as BlacklistMatchType)}
            >
              <SelectTrigger id="blacklist-match-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">{t("blacklist.matchContains")}</SelectItem>
                <SelectItem value="exact">{t("blacklist.matchExact")}</SelectItem>
                <SelectItem value="starts_with">{t("blacklist.matchStartsWith")}</SelectItem>
                <SelectItem value="ends_with">{t("blacklist.matchEndsWith")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="blacklist-reason">{t("blacklist.reason")}</Label>
          <Input
            id="blacklist-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("blacklist.reasonPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
        </div>
        <Button onClick={handleAdd} disabled={adding || !pattern.trim()} size="sm" className="gap-1.5">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("blacklist.addEntry")}
        </Button>
      </div>

      {/* Entries list */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Ban className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{t("blacklist.noEntries")}</p>
          <p className="text-sm mt-1">{t("blacklist.noEntriesHint")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{entry.pattern}</span>
                  <span className="text-xs rounded-full bg-muted px-2 py-0.5 shrink-0">
                    {t(MATCH_TYPE_KEYS[entry.matchType])}
                  </span>
                </div>
                {entry.reason && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {entry.reason}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0"
                onClick={() => handleRemove(entry.id)}
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
