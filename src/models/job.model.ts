import { Resume } from "./profile.model";

export interface JobForm {
  id?: string;
  userId?: string;
  source: string;
  title: string;
  type: string;
  company: string;
  location: string;
  status: string;
  dueDate: Date;
  dateApplied?: Date;
  salaryRange: string;
  jobDescription: string;
  jobUrl?: string;
  applied: boolean;
}

export interface Tag {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  _count?: {
    jobs: number;
    questions: number;
  };
}

export interface JobResponse {
  id: string;
  userId: string;
  JobTitle: JobTitle;
  Company: Company;
  Status: JobStatus;
  Location?: JobLocation | null;
  JobSource?: JobSource | null;
  jobType: string;
  createdAt: Date;
  appliedDate: Date | null;
  dueDate: Date | null;
  salaryRange: string | null;
  description?: string;
  jobUrl: string | null;
  applied: boolean;
  resumeId?: string | null;
  Resume?: Resume | null;
  matchScore?: number | null;
  matchData?: string | null;
  tags?: Tag[];
  _count?: { Notes?: number };
}

export interface JobTitle {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  _count?: {
    jobs: number;
  };
}

export interface Company {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  logoUrl?: string | null;
  _count?: {
    jobsApplied: number;
  };
}

export interface JobStatus {
  id: string;
  label: string;
  value: string;
}

export interface JobSource {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  _count?: {
    jobsApplied: number;
  };
}

export interface JobLocation {
  id: string;
  label: string;
  value: string;
  stateProv?: string | null;
  country?: string | null;
  createdBy: string;
  _count?: {
    jobsApplied: number;
  };
}

export interface Country {
  id: string;
  label: string;
  value: string;
}

export enum JOB_TYPES {
  FT = "Full-time",
  PT = "Part-time",
  C = "Contract",
}
