import type { DiscoveryStatus } from "@/models/automation.model";
import type { DiscoveredVacancy } from "./types";
import {
  findOrCreateJobTitle,
  findOrCreateLocation,
  findOrCreateCompany,
  getOrCreateJobSource,
  getDefaultJobStatus,
} from "./reference-data";

// Re-export reference-data helpers for backwards compatibility
export {
  findOrCreateJobTitle,
  findOrCreateLocation,
  findOrCreateCompany,
  getOrCreateJobSource,
  getDefaultJobStatus,
} from "./reference-data";

interface MapperInput {
  vacancy: DiscoveredVacancy;
  userId: string;
  automationId: string;
  matchScore: number;
  matchData: string;
}

interface MapperOutput {
  userId: string;
  automationId: string;
  jobUrl: string;
  description: string;
  jobType: string;
  createdAt: Date;
  applied: boolean;
  statusId: string;
  jobTitleId: string;
  companyId: string;
  jobSourceId: string;
  locationId: string | null;
  matchScore: number;
  matchData: string;
  discoveryStatus: DiscoveryStatus;
  discoveredAt: Date;
}

/** @deprecated Use staged-vacancy-mapper.ts for intake and promoter.ts for promotion */
export async function mapDiscoveredVacancyToJobRecord(
  input: MapperInput
): Promise<MapperOutput> {
  const { vacancy, userId, automationId, matchScore, matchData } = input;

  const jobTitleId = await findOrCreateJobTitle(vacancy.title, userId);
  const locationId = await findOrCreateLocation(vacancy.location, userId);
  const companyId = await findOrCreateCompany(vacancy.employerName, userId);
  const jobSourceId = await getOrCreateJobSource(vacancy.sourceBoard, userId);
  const statusId = await getDefaultJobStatus();

  return {
    userId,
    automationId,
    jobUrl: vacancy.sourceUrl,
    description: vacancy.description,
    jobType: "full-time",
    createdAt: new Date(),
    applied: false,
    statusId,
    jobTitleId,
    companyId,
    jobSourceId,
    locationId,
    matchScore,
    matchData,
    discoveryStatus: "new",
    discoveredAt: new Date(),
  };
}
