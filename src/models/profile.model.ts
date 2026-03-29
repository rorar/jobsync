import { Company, JobLocation, JobTitle } from "./job.model";

export interface Resume {
  id: string;
  profileId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  ContactInfo?: ContactInfo;
  ResumeSections?: ResumeSection[];
  FileId: string | null;
  File?: File;
  _count?: {
    Job?: number;
  };
}

export interface File {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  uploadedAt: Date;
  Resume?: Resume;
}

export interface ContactInfo {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  resumeId: string;
  firstName: string;
  lastName: string;
  headline: string;
  email: string;
  phone: string;
  address: string | null;
}

export enum SectionType {
  SUMMARY = "summary",
  EXPERIENCE = "experience",
  EDUCATION = "education",
  LICENSE = "license",
  CERTIFICATION = "certification",
  COURSE = "course",
  PROJECT = "project",
  OTHER = "other",
}

export interface Summary {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  content: string;
}

export interface SummarySectionForm {
  id?: string;
  resumeId: string;
  sectionTitle: string;
  sectionType: string;
  content: string;
}

export interface ResumeSection {
  id: string;
  resumeId: string;
  sectionTitle: string;
  sectionType: SectionType;
  summary?: Summary;
  workExperiences?: WorkExperience[];
  educations?: Education[];
}

export interface WorkExperience {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  companyId: string;
  jobTitleId: string;
  locationId: string;
  resumeSectionId: string | null;
  Company?: Company;
  jobTitle?: JobTitle;
  location?: JobLocation;
  startDate: Date;
  endDate: Date | null;
  currentJob?: boolean;
  description: string;
}

export interface Education {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  locationId: string;
  resumeSectionId: string | null;
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: Date;
  endDate: Date | null;
  description: string | null;
  location?: JobLocation;
}
