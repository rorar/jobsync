"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, formatDateShort } from "@/i18n";
import { listReferrals, type ReferralListEntry } from "@/actions/referral.actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Network, Plus, AlertTriangle } from "lucide-react";
import { ReferralStatusBadge } from "@/components/inside-track/ReferralStatusBadge";
import { ReferralKindBadge } from "@/components/inside-track/ReferralKindBadge";
import { TipCaptureSheet } from "@/components/inside-track/TipCaptureSheet";
import { tipsterDisplayName } from "@/components/inside-track/referralDisplay";
import { REFERRAL_STATUSES, REFERRAL_KINDS } from "@/models/insideTrack.model";

export default function ReferralsPageClient() {
  const { t, locale } = useTranslations();
  const router = useRouter();

  const [referrals, setReferrals] = useState<ReferralListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listReferrals();
    if (result.success && result.data) {
      setReferrals(result.data);
    } else {
      setError(result.message ?? "insideTrack.list.loadError");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = referrals.filter(
    (r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (kindFilter === "all" || r.kind === kindFilter),
  );

  // Error state
  if (error && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-4 py-20 md:p-6">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">{t("insideTrack.list.loadError")}</p>
        <Button variant="outline" onClick={load}>
          {t("insideTrack.list.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="col-span-3 space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("insideTrack.pageTitle")}</h1>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("insideTrack.newTip")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" aria-label={t("insideTrack.filter.allStatuses")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("insideTrack.filter.allStatuses")}</SelectItem>
            {REFERRAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`insideTrack.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" aria-label={t("insideTrack.filter.allKinds")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("insideTrack.filter.allKinds")}</SelectItem>
            {REFERRAL_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`insideTrack.kind.${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {loading && (
        <Skeleton label={t("insideTrack.pageTitle")}>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        </Skeleton>
      )}

      {/* Empty (no referrals at all) */}
      {!loading && referrals.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Network className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
          <div className="text-center">
            <h3 className="text-lg font-medium">{t("insideTrack.list.empty.title")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("insideTrack.list.empty.description")}
            </p>
          </div>
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("insideTrack.newTip")}
          </Button>
        </div>
      )}

      {/* Empty (filtered) */}
      {!loading && referrals.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-muted-foreground">{t("insideTrack.list.emptyFiltered")}</p>
          <Button
            variant="ghost"
            onClick={() => {
              setStatusFilter("all");
              setKindFilter("all");
            }}
          >
            {t("insideTrack.list.clearFilters")}
          </Button>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("insideTrack.list.col.company")}</TableHead>
                <TableHead>{t("insideTrack.list.col.tipster")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("insideTrack.list.col.kind")}</TableHead>
                <TableHead>{t("crm.status")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("insideTrack.list.col.lastActivity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/dashboard/referrals/${r.id}`)}
                >
                  <TableCell className="font-medium">
                    {r.targetCompany?.label ?? t("insideTrack.list.noCompany")}
                  </TableCell>
                  <TableCell>{tipsterDisplayName(r.tipster, t)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <ReferralKindBadge kind={r.kind} />
                  </TableCell>
                  <TableCell>
                    <ReferralStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {formatDateShort(new Date(r.lastActivityAt), locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TipCaptureSheet open={sheetOpen} onOpenChange={setSheetOpen} onRecorded={load} />
    </div>
  );
}
