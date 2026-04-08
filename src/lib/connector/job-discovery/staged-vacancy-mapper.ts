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

  // Extended fields (ROADMAP 1.1b Phase 1)
  companyUrl: string | null;
  companyDescription: string | null;
  industryCodes?: string[];
  companySize: string | null;
  positionOfferingCode: string | null;
  numberOfPosts: number | null;
  occupationUris?: string[];
  requiredEducationLevel: string | null;
  requiredExperienceYears: number | null;
  workingLanguages?: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  immediateStart: boolean | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  euresFlag: boolean | null;

  source: string;
  automationId: string;
  matchScore: number | null;
  matchData: string | null;
  status: string;
  discoveredAt: Date;
}

export function mapDiscoveredVacancyToStagedInput(params: {
  vacancy: DiscoveredVacancy;
  userId: string;
  automationId: string;
  matchScore: number | null;
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
    companyUrl: vacancy.companyUrl ?? null,
    companyDescription: vacancy.companyDescription ?? null,
    industryCodes: vacancy.industryCodes ?? undefined,
    companySize: vacancy.companySize ?? null,
    positionOfferingCode: vacancy.positionOfferingCode ?? null,
    numberOfPosts: vacancy.numberOfPosts ?? null,
    occupationUris: vacancy.occupationUris ?? undefined,
    requiredEducationLevel: vacancy.requiredEducationLevel ?? null,
    requiredExperienceYears: vacancy.requiredExperienceYears ?? null,
    workingLanguages: vacancy.workingLanguages ?? undefined,
    salaryMin: vacancy.salaryMin ?? null,
    salaryMax: vacancy.salaryMax ?? null,
    salaryCurrency: vacancy.salaryCurrency ?? null,
    salaryPeriod: vacancy.salaryPeriod ?? null,
    immediateStart: vacancy.immediateStart ?? null,
    contractStartDate: vacancy.contractStartDate ?? null,
    contractEndDate: vacancy.contractEndDate ?? null,
    euresFlag: vacancy.euresFlag ?? null,
    source: "automation",
    automationId,
    matchScore,
    matchData,
    status: "staged",
    discoveredAt: new Date(),
  };
}
