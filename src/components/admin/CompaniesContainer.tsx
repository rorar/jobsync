"use client";
import { useCallback, useEffect, useState } from "react";
import AddCompany from "./AddCompany";
import CompaniesTable from "./CompaniesTable";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Company } from "@/models/job.model";
import { getCompanyById, getCompanyList } from "@/actions/company.actions";
import { APP_CONSTANTS } from "@/lib/constants";
import Loading from "../Loading";
import { Button } from "../ui/button";
import { RecordsPerPageSelector } from "../RecordsPerPageSelector";
import { RecordsCount } from "../RecordsCount";
import { useTranslations } from "@/i18n";

function CompaniesContainer() {
  const { t } = useTranslations();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [totalCompanies, setTotalCompanies] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCompany, setEditCompany] = useState(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [recordsPerPage, setRecordsPerPage] = useState<number>(
    APP_CONSTANTS.RECORDS_PER_PAGE,
  );

  const loadCompanies = useCallback(
    async (page: number) => {
      setLoading(true);
      try {
        const { data, total } = await getCompanyList(
          page,
          recordsPerPage,
          "applied"
        );
        if (data) {
          setCompanies((prev) => (page === 1 ? data : [...prev, ...(data as any[])]) as any);
          setTotalCompanies(total ?? 0);
          setPage(page);
        }
      } finally {
        setLoading(false);
      }
    },
    [recordsPerPage]
  );

  const reloadCompanies = useCallback(async () => {
    await loadCompanies(1);
  }, [loadCompanies]);

  const resetEditCompany = () => {
    setEditCompany(null);
  };

  useEffect(() => {
    (async () => await loadCompanies(1))();
  }, [loadCompanies, recordsPerPage]);

  const onEditCompany = async (companyId: string) => {
    const { data: company } = await getCompanyById(companyId);
    setEditCompany(company as any);
    setDialogOpen(true);
  };

  return (
    <>
      <div className="col-span-3">
        <Card x-chunk="dashboard-06-chunk-0">
          <CardHeader className="flex-row justify-between items-center">
            <CardTitle as="h2">{t("admin.companies")}</CardTitle>
            <div className="flex items-center">
              <div className="ml-auto flex items-center gap-2">
                <AddCompany
                  editCompany={editCompany}
                  reloadCompanies={reloadCompanies}
                  resetEditCompany={resetEditCompany}
                  dialogOpen={dialogOpen}
                  setDialogOpen={setDialogOpen}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/*
              A live region that enters the DOM together with its content is
              announced inconsistently; one that is already mounted when its
              content changes is not. So the announcement lives here, always
              rendered, and the spinner below is aria-hidden so that the two
              never announce the same thing twice.
            */}
            <div role="status" aria-live="polite" className="sr-only">
              {loading ? t("common.loading") : ""}
            </div>
            {loading && (
              <div aria-hidden="true">
                <Loading />
              </div>
            )}
            {companies.length > 0 && (
              <>
                <CompaniesTable
                  companies={companies}
                  reloadCompanies={reloadCompanies}
                  editCompany={onEditCompany}
                />
                <div className="flex items-center justify-between mt-4">
                  <RecordsCount
                    count={companies.length}
                    total={totalCompanies}
                    label="companies"
                  />
                  {totalCompanies > APP_CONSTANTS.RECORDS_PER_PAGE && (
                    <RecordsPerPageSelector
                      value={recordsPerPage}
                      onChange={setRecordsPerPage}
                    />
                  )}
                </div>
              </>
            )}
            {/*
              Without this, an empty list renders a blank card: no table, no
              message, no explanation. Same shape as ActivityTypesContainer.
            */}
            {!loading && companies.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {t("admin.noCompanies")}
              </div>
            )}
            {companies.length < totalCompanies && (
              <div className="flex justify-center p-4">
                {/*
                  The label stays put: with aria-disabled the button no longer
                  vanishes from the focus model when it goes inert, and the
                  live region above already announces the load.
                */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // aria-disabled keeps the button focusable and in the tab
                    // order, so refusing the activation is the handler's job.
                    if (loading) return;
                    loadCompanies(page + 1);
                  }}
                  aria-disabled={loading}
                  className="btn btn-primary aria-disabled:opacity-50"
                >
                  {t("common.loadMore")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default CompaniesContainer;
