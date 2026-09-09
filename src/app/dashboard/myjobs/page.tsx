import { Metadata } from "next";

import { getJobSourceList, getStatusList } from "@/actions/job.actions";
import JobsContainer from "@/components/myjobs/JobsContainer";
import { getAllCompanies } from "@/actions/company.actions";
import { getAllJobTitles } from "@/actions/jobtitle.actions";
import { getAllJobLocations } from "@/actions/jobLocation.actions";
import { getAllTags } from "@/actions/tag.actions";

export const metadata: Metadata = {
  title: "My Jobs | JobSync",
};

async function MyJobs() {
  const [statusesResult, companiesResult, titlesResult, locationsResult, sourcesResult, tagsResult] =
    await Promise.all([
      getStatusList(),
      getAllCompanies(),
      getAllJobTitles(),
      getAllJobLocations(),
      getJobSourceList(),
      getAllTags(),
    ]);
  const statuses = statusesResult.success ? statusesResult.data ?? [] : [];
  const companies = companiesResult.success ? companiesResult.data ?? [] : [];
  const titles = titlesResult.success ? titlesResult.data ?? [] : [];
  const locations = locationsResult.success ? locationsResult.data ?? [] : [];
  const sources = sourcesResult.success ? sourcesResult.data ?? [] : [];
  const tags = tagsResult.success ? tagsResult.data ?? [] : [];
  return (
    <div className="col-span-3">
      <JobsContainer
        companies={companies}
        titles={titles}
        locations={locations}
        sources={sources}
        statuses={statuses}
        tags={tags}
      />
    </div>
  );
}

export default MyJobs;
