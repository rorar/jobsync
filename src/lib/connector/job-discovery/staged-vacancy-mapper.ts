import type { DiscoveredVacancy } from "./types";

interface StagedVacancyInput {
  userId: string;
  sourceBoard: string;
  externalId: string | null;
  sourceUrl: string | null;
  title: string;
  employerName: string | null;
  location: string | null;
  description: string | null;
  salary: string | null;
  employmentType: string | null;
  postedAt: Date | null;
  applicationDeadline: string | null;
  applicationInstructions: string | null;
  source: string;
  automationId: string;
  matchScore: number;
  matchData: string | null;
  status: string;
  discoveredAt: Date;
}

export function mapDiscoveredVacancyToStagedInput(params: {
  vacancy: DiscoveredVacancy;
  userId: string;
  automationId: string;
  matchScore: number;
  matchData: string | null;
}): StagedVacancyInput {
  const { vacancy, userId, automationId, matchScore, matchData } = params;

  return {
    userId,
    sourceBoard: vacancy.sourceBoard,
    externalId: vacancy.externalId ?? null,
    sourceUrl: vacancy.sourceUrl ?? null,
    title: vacancy.title,
    employerName: vacancy.employerName ?? null,
    location: vacancy.location ?? null,
    description: vacancy.description ?? null,
    salary: vacancy.salary ?? null,
    employmentType: vacancy.employmentType ?? null,
    postedAt: vacancy.postedAt ?? null,
    applicationDeadline: vacancy.applicationDeadline ?? null,
    applicationInstructions: vacancy.applicationInstructions ?? null,
    source: "automation",
    automationId,
    matchScore,
    matchData,
    status: "staged",
    discoveredAt: new Date(),
  };
}
