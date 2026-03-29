import { getJobDetails } from "@/actions/job.actions";
import JobDetails from "@/components/myjobs/JobDetails";
import { notFound } from "next/navigation";

async function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: job, success } = await getJobDetails(id);

  if (!success || !job) {
    notFound();
  }

  return (
    <div className="col-span-3">
      <JobDetails job={job} />
    </div>
  );
}

export default JobDetailsPage;
