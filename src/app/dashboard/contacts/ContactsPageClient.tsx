"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, formatDateShort } from "@/i18n";
import { toast } from "@/components/ui/use-toast";
import { getPersons, createPerson } from "@/actions/person.actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Users, Plus, Search, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import PersonForm from "@/components/crm/PersonForm";
import type { PersonStatus, DataSource, TypedEmail, CompanyAssociation } from "@/models/person.model";

const PAGE_SIZE = 25;

const statusVariant = (status: string) => {
  switch (status) {
    case "active":
      return "default" as const;
    case "archived":
      return "secondary" as const;
    case "anonymized":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
};

const dataSourceVariant = (source: string) => {
  switch (source) {
    case "manual":
      return "default" as const;
    case "auto_created":
      return "secondary" as const;
    case "imported":
      return "outline" as const;
    default:
      return "outline" as const;
  }
};

export default function ContactsPageClient() {
  const { t, locale } = useTranslations();
  const router = useRouter();

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PersonStatus | "all">("all");
  const [dataSourceFilter, setDataSourceFilter] = useState<DataSource | "all">("all");
  const [page, setPage] = useState(1);

  // Data
  const [persons, setPersons] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sheet
  const [sheetOpen, setSheetOpen] = useState(false);

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dataSourceFilter]);

  // Load data
  const loadPersons = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getPersons({
      search: debouncedSearch || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      dataSource: dataSourceFilter === "all" ? undefined : dataSourceFilter,
      page,
      pageSize: PAGE_SIZE,
    });
    if (result.success && result.data) {
      setPersons(result.data.persons);
      setTotal(result.data.total);
    } else {
      setError(result.message ?? t("crm.errors.personNotFound"));
    }
    setLoading(false);
  }, [debouncedSearch, statusFilter, dataSourceFilter, page, t]);

  useEffect(() => {
    loadPersons();
  }, [loadPersons]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleCreate = async (input: Record<string, unknown>) => {
    const result = await createPerson(input as unknown as Parameters<typeof createPerson>[0]);
    if (result.success) {
      toast({
        title: t("crm.contactCreated"),
      });
      setSheetOpen(false);
      loadPersons();
    } else {
      toast({
        title: t("crm.errors.emailRequired"),
        description: result.message ? t(result.message) : undefined,
        variant: "destructive",
      });
    }
  };

  const getPrimaryEmail = (emails: unknown): string => {
    if (!Array.isArray(emails)) return "";
    const primary = (emails as TypedEmail[]).find((e) => e.isPrimary);
    return primary?.email ?? (emails as TypedEmail[])[0]?.email ?? "";
  };

  const getDisplayName = (person: Record<string, unknown>): string => {
    const parts = [person.firstName, person.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "---";
  };

  const getCompanyLabel = (person: Record<string, unknown>): string => {
    const companies = person.companies as CompanyAssociation[] | undefined;
    if (!companies || companies.length === 0) return "";
    const primary = companies.find((c) => c.isPrimary) ?? companies[0];
    return primary.companyLabel;
  };

  // Error state
  if (error && !loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-4 py-20 md:p-6">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">{t("crm.loadError")}</p>
        <Button variant="outline" onClick={loadPersons}>
          {t("crm.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="col-span-3 space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("crm.contacts")}</h1>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("crm.addContact")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("crm.searchContacts")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as PersonStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("crm.all")}</SelectItem>
            <SelectItem value="active">{t("crm.status.active")}</SelectItem>
            <SelectItem value="archived">{t("crm.status.archived")}</SelectItem>
            <SelectItem value="anonymized">{t("crm.status.anonymized")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={dataSourceFilter}
          onValueChange={(v) => setDataSourceFilter(v as DataSource | "all")}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("crm.all")}</SelectItem>
            <SelectItem value="manual">{t("crm.dataSource.manual")}</SelectItem>
            <SelectItem value="auto_created">{t("crm.dataSource.auto_created")}</SelectItem>
            <SelectItem value="imported">{t("crm.dataSource.imported")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {loading && (
        <Skeleton label={t("crm.contacts")}>
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

      {/* Empty state */}
      {!loading && persons.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Users className="h-16 w-16 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-lg font-medium">{t("crm.noContacts")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("crm.noContactsDescription")}
            </p>
          </div>
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("crm.addContact")}
          </Button>
        </div>
      )}

      {/* Table */}
      {!loading && persons.length > 0 && (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("crm.name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("crm.primaryEmail")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("crm.company")}</TableHead>
                  <TableHead>{t("crm.status")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("crm.source")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("crm.createdAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {persons.map((person) => (
                  <TableRow
                    key={person.id as string}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/contacts/${person.id}`)}
                  >
                    <TableCell className="font-medium">
                      {getDisplayName(person)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {getPrimaryEmail(person.emails)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {getCompanyLabel(person)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(person.status as string)}>
                        {t(`crm.status.${person.status}` as Parameters<typeof t>[0])}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant={dataSourceVariant(person.dataSource as string)}>
                        {t(`crm.dataSource.${person.dataSource}` as Parameters<typeof t>[0])}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {person.createdAt
                        ? formatDateShort(new Date(person.createdAt as string), locale)
                        : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-sm text-muted-foreground">
                {total} {t("crm.contacts").toLowerCase()}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Contact Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[90vw] max-w-lg overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("crm.addContact")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("crm.noContactsDescription")}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <PersonForm
              onSubmit={handleCreate}
              onCancel={() => setSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
