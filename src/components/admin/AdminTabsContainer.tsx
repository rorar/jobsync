"use client";
import ActivityTypesContainer from "@/components/admin/ActivityTypesContainer";
import CompaniesContainer from "@/components/admin/CompaniesContainer";
import JobLocationsContainer from "@/components/admin/JobLocationsContainer";
import JobSourcesContainer from "@/components/admin/JobSourcesContainer";
import JobTitlesContainer from "@/components/admin/JobTitlesContainer";
import TagsContainer from "@/components/admin/TagsContainer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

function AdminTabsContainer() {
  const { t } = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const queryParams = useSearchParams();

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(queryParams.toString());
      params.set(name, value);

      return params.toString();
    },
    [queryParams],
  );

  const onTabChange = (tab: string) => {
    // replace, not push: the tab is a view state, not a destination. Every
    // change used to add a history entry, so Back walked the user through the
    // tabs they had visited instead of leaving the admin page — and the more
    // tabs there are, the longer that walk. Six now.
    router.replace(pathname + "?" + createQueryString("tab", tab));
  };
  return (
    <Tabs
      defaultValue={queryParams.get("tab") || "companies"}
      activationMode="manual"
      // Manual activation: an arrow key moves focus, Enter or Space activates.
      // Radix defaults to automatic, where each arrow key press selects the tab
      // it lands on — and selecting a tab here MOUNTS its container and fires a
      // server fetch (Radix only mounts the active TabsContent). Arrowing from
      // Companies to Activity Types therefore issued five loads to reach one.
      // This is the pattern the ARIA authoring practices prescribe when
      // activation is expensive.
      onValueChange={(e) => onTabChange(e)}
    >
      <TabsList>
        <TabsTrigger value="companies">{t("admin.companies")}</TabsTrigger>
        <TabsTrigger value="job-titles">{t("admin.jobTitles")}</TabsTrigger>
        <TabsTrigger value="locations">{t("admin.locations")}</TabsTrigger>
        <TabsTrigger value="sources">{t("admin.sources")}</TabsTrigger>
        <TabsTrigger value="skills">{t("admin.skills")}</TabsTrigger>
        <TabsTrigger value="activity-types">
          {t("admin.activityTypes")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="companies">
        <CompaniesContainer />
      </TabsContent>
      <TabsContent value="job-titles">
        <JobTitlesContainer />
      </TabsContent>
      <TabsContent value="locations">
        <JobLocationsContainer />
      </TabsContent>
      <TabsContent value="sources">
        <JobSourcesContainer />
      </TabsContent>
      <TabsContent value="skills">
        <TagsContainer />
      </TabsContent>
      <TabsContent value="activity-types">
        <ActivityTypesContainer />
      </TabsContent>
    </Tabs>
  );
}

export default AdminTabsContainer;
