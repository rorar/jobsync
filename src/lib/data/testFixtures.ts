/**
 * Reusable test fixtures for unit tests.
 * Import what you need: import { mockUser, mockJob } from "@/lib/data/testFixtures"
 */

import type { CurrentUser } from "@/models/user.model";
import type { JobResponse, Company, JobTitle, JobStatus, JobLocation, JobSource, Tag } from "@/models/job.model";
import type { Activity, ActivityType } from "@/models/activity.model";
import type { Task } from "@/models/task.model";
import type { Resume } from "@/models/profile.model";
import type { Automation } from "@/models/automation.model";
import type { Question } from "@/models/question.model";
import type { StagedVacancy } from "@/models/stagedVacancy.model";

// ─── User ──────────────────────────────────────────────────────────────────

export const mockUser: CurrentUser = {
  id: "test-user-id",
  name: "Test User",
  email: "test.user@example.com",
};

// ─── Company ───────────────────────────────────────────────────────────────

export const mockCompany: Company = {
  id: "company-fixture-id",
  label: "Acme Corp",
  value: "acme corp",
  createdBy: mockUser.id,
  logoUrl: "https://example.com/acme-logo.png",
  _count: { jobsApplied: 3 },
};

// ─── Job Title ─────────────────────────────────────────────────────────────

export const mockJobTitle: JobTitle = {
  id: "job-title-fixture-id",
  label: "Software Engineer",
  value: "software engineer",
  createdBy: mockUser.id,
  _count: { jobs: 5 },
};

// ─── Job Status ────────────────────────────────────────────────────────────

export const mockJobStatus: JobStatus = {
  id: "status-fixture-id",
  label: "Applied",
  value: "applied",
};

// ─── Job Location ──────────────────────────────────────────────────────────

export const mockJobLocation: JobLocation = {
  id: "location-fixture-id",
  label: "San Francisco, CA",
  value: "san francisco, ca",
  stateProv: "CA",
  country: "US",
  createdBy: mockUser.id,
};

// ─── Job Source ────────────────────────────────────────────────────────────

export const mockJobSource: JobSource = {
  id: "source-fixture-id",
  label: "LinkedIn",
  value: "linkedin",
  createdBy: mockUser.id,
};

// ─── Resume ────────────────────────────────────────────────────────────────

export const mockResume: Resume = {
  id: "resume-fixture-id",
  profileId: "profile-fixture-id",
  title: "Software Engineer Resume",
  createdAt: new Date("2024-01-15T10:00:00.000Z"),
  updatedAt: new Date("2024-06-01T12:00:00.000Z"),
  FileId: null,
};

// ─── Job ───────────────────────────────────────────────────────────────────

export const mockJob: JobResponse = {
  id: "job-fixture-id",
  userId: mockUser.id,
  JobTitle: mockJobTitle,
  Company: mockCompany,
  Status: mockJobStatus,
  Location: mockJobLocation,
  JobSource: mockJobSource,
  jobType: "FT",
  createdAt: new Date("2024-06-01T09:00:00.000Z"),
  appliedDate: new Date("2024-06-02T10:00:00.000Z"),
  dueDate: new Date("2024-07-01T00:00:00.000Z"),
  salaryRange: "$90,000 - $120,000",
  description: "Build and maintain web applications using modern frameworks.",
  jobUrl: "https://example.com/jobs/software-engineer",
  applied: true,
  resumeId: mockResume.id,
  tags: [],
};

// ─── Activity Type ─────────────────────────────────────────────────────────

export const mockActivityType: ActivityType = {
  id: "activity-type-fixture-id",
  label: "Learning",
  value: "Learning",
  description: null,
  createdBy: mockUser.id,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
};

// ─── Activity ──────────────────────────────────────────────────────────────

export const mockActivity: Activity = {
  id: "activity-fixture-id",
  activityTypeId: mockActivityType.id,
  activityType: mockActivityType,
  userId: mockUser.id,
  activityName: "TypeScript Advanced Concepts",
  startTime: new Date("2024-06-19T09:00:00.000Z"),
  endTime: new Date("2024-06-19T10:00:00.000Z"),
  duration: 60,
  description: "[MOCK_DATA] TypeScript Advanced Concepts",
  taskId: null,
  createdAt: new Date("2024-06-19T09:00:00.000Z"),
  updatedAt: new Date("2024-06-19T10:00:00.000Z"),
};

// ─── Task ──────────────────────────────────────────────────────────────────

export const mockTask: Task = {
  id: "task-fixture-id",
  userId: mockUser.id,
  title: "Prepare for system design interview",
  description: "Review common distributed systems patterns and practice whiteboarding.",
  status: "in-progress",
  priority: 1,
  percentComplete: 40,
  dueDate: new Date("2024-07-15T00:00:00.000Z"),
  activityTypeId: mockActivityType.id,
  createdAt: new Date("2024-06-10T08:00:00.000Z"),
  updatedAt: new Date("2024-06-18T14:30:00.000Z"),
};

// ─── Automation ────────────────────────────────────────────────────────────

export const mockAutomation: Automation = {
  id: "automation-fixture-id",
  userId: mockUser.id,
  name: "Daily Software Engineer Search",
  jobBoard: "jsearch",
  keywords: "software engineer react typescript",
  location: "San Francisco, CA",
  resumeId: mockResume.id!,
  matchThreshold: 70,
  scheduleHour: 8,
  scheduleFrequency: "daily",
  nextRunAt: new Date("2024-06-20T08:00:00.000Z"),
  lastRunAt: new Date("2024-06-19T08:00:00.000Z"),
  connectorParams: null,
  status: "active",
  pauseReason: null,
  createdAt: new Date("2024-06-01T00:00:00.000Z"),
  updatedAt: new Date("2024-06-19T08:00:00.000Z"),
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPANDED MOCK DATA — Diverse fixtures for comprehensive testing
// ═══════════════════════════════════════════════════════════════════════════

// ─── Additional Companies (with diverse logo formats including SVG) ─────

export const mockCompanySvgLogo: Company = {
  id: "company-svg-logo-id",
  label: "GitHub",
  value: "github",
  createdBy: mockUser.id,
  logoUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  _count: { jobsApplied: 5 },
};

export const mockCompanyNoLogo: Company = {
  id: "company-no-logo-id",
  label: "Stealth Startup",
  value: "stealth startup",
  createdBy: mockUser.id,
  logoUrl: "",
  _count: { jobsApplied: 1 },
};

export const mockCompanySvgInline: Company = {
  id: "company-svg-inline-id",
  label: "Shopify",
  value: "shopify",
  createdBy: mockUser.id,
  logoUrl: "https://upload.wikimedia.org/wikipedia/commons/0/0e/Shopify_logo_2018.svg",
  _count: { jobsApplied: 2 },
};

export const mockCompanyIcoLogo: Company = {
  id: "company-ico-logo-id",
  label: "Stack Overflow",
  value: "stack overflow",
  createdBy: mockUser.id,
  logoUrl: "https://cdn.sstatic.net/Sites/stackoverflow/img/favicon.ico",
  _count: { jobsApplied: 0 },
};

export const mockCompanyWebpLogo: Company = {
  id: "company-webp-logo-id",
  label: "Vercel",
  value: "vercel",
  createdBy: mockUser.id,
  logoUrl: "https://assets.vercel.com/image/upload/v1607554385/repositories/vercel/logo.png",
  _count: { jobsApplied: 4 },
};

export const mockCompanies: Company[] = [
  mockCompany,
  mockCompanySvgLogo,
  mockCompanyNoLogo,
  mockCompanySvgInline,
  mockCompanyIcoLogo,
  mockCompanyWebpLogo,
];

// ─── Additional Job Statuses ──────────────────────────────────────────────

export const mockJobStatusDraft: JobStatus = {
  id: "status-draft-id",
  label: "Draft",
  value: "draft",
};

export const mockJobStatusInterview: JobStatus = {
  id: "status-interview-id",
  label: "Interview",
  value: "interview",
};

export const mockJobStatusOffer: JobStatus = {
  id: "status-offer-id",
  label: "Offer",
  value: "offer",
};

export const mockJobStatusRejected: JobStatus = {
  id: "status-rejected-id",
  label: "Rejected",
  value: "rejected",
};

export const mockJobStatusExpired: JobStatus = {
  id: "status-expired-id",
  label: "Expired",
  value: "expired",
};

export const mockJobStatusArchived: JobStatus = {
  id: "status-archived-id",
  label: "Archived",
  value: "archived",
};

// ─── Additional Job Locations ─────────────────────────────────────────────

export const mockJobLocationRemote: JobLocation = {
  id: "location-remote-id",
  label: "Remote",
  value: "remote",
  createdBy: mockUser.id,
};

export const mockJobLocationNewYork: JobLocation = {
  id: "location-ny-id",
  label: "New York, NY",
  value: "new york, ny",
  stateProv: "NY",
  country: "US",
  createdBy: mockUser.id,
};

export const mockJobLocationBerlin: JobLocation = {
  id: "location-berlin-id",
  label: "Berlin",
  value: "berlin",
  country: "DE",
  createdBy: mockUser.id,
};

export const mockJobLocationLondon: JobLocation = {
  id: "location-london-id",
  label: "London",
  value: "london",
  country: "GB",
  createdBy: mockUser.id,
};

// ─── Additional Job Sources ───────────────────────────────────────────────

export const mockJobSourceIndeed: JobSource = {
  id: "source-indeed-id",
  label: "Indeed",
  value: "indeed",
  createdBy: mockUser.id,
};

export const mockJobSourceCareerPage: JobSource = {
  id: "source-careerpage-id",
  label: "Company Career page",
  value: "careerpage",
  createdBy: mockUser.id,
};

export const mockJobSourceGlassdoor: JobSource = {
  id: "source-glassdoor-id",
  label: "Glassdoor",
  value: "glassdoor",
  createdBy: mockUser.id,
};

// ─── Additional Job Titles ────────────────────────────────────────────────

export const mockJobTitleFrontend: JobTitle = {
  id: "job-title-frontend-id",
  label: "Frontend Developer",
  value: "frontend developer",
  createdBy: mockUser.id,
  _count: { jobs: 3 },
};

export const mockJobTitleDevOps: JobTitle = {
  id: "job-title-devops-id",
  label: "DevOps Engineer",
  value: "devops engineer",
  createdBy: mockUser.id,
  _count: { jobs: 2 },
};

export const mockJobTitleDataEngineer: JobTitle = {
  id: "job-title-data-eng-id",
  label: "Data Engineer",
  value: "data engineer",
  createdBy: mockUser.id,
  _count: { jobs: 1 },
};

// ─── Tags / Skills ────────────────────────────────────────────────────────

export const mockTagReact: Tag = {
  id: "tag-react-id",
  label: "React",
  value: "react",
  createdBy: mockUser.id,
  _count: { jobs: 5, questions: 3 },
};

export const mockTagTypescript: Tag = {
  id: "tag-typescript-id",
  label: "TypeScript",
  value: "typescript",
  createdBy: mockUser.id,
  _count: { jobs: 4, questions: 2 },
};

export const mockTagPython: Tag = {
  id: "tag-python-id",
  label: "Python",
  value: "python",
  createdBy: mockUser.id,
  _count: { jobs: 2, questions: 4 },
};

export const mockTagKubernetes: Tag = {
  id: "tag-kubernetes-id",
  label: "Kubernetes",
  value: "kubernetes",
  createdBy: mockUser.id,
  _count: { jobs: 1, questions: 1 },
};

export const mockTagSystemDesign: Tag = {
  id: "tag-system-design-id",
  label: "System Design",
  value: "system design",
  createdBy: mockUser.id,
  _count: { jobs: 0, questions: 5 },
};

// ─── Diverse Jobs ─────────────────────────────────────────────────────────

export const mockJobDraft: JobResponse = {
  id: "job-draft-id",
  userId: mockUser.id,
  JobTitle: mockJobTitleFrontend,
  Company: mockCompanySvgLogo,
  Status: mockJobStatusDraft,
  Location: mockJobLocationRemote,
  JobSource: mockJobSource,
  jobType: "FT",
  createdAt: new Date("2024-06-15T09:00:00.000Z"),
  appliedDate: new Date("2024-06-15T09:00:00.000Z"),
  dueDate: new Date("2024-07-15T00:00:00.000Z"),
  salaryRange: "$80,000 - $100,000",
  description: "Draft position for a frontend developer role at GitHub.",
  jobUrl: "",
  applied: false,
  tags: [mockTagReact, mockTagTypescript],
};

export const mockJobInterview: JobResponse = {
  id: "job-interview-id",
  userId: mockUser.id,
  JobTitle: mockJobTitle,
  Company: mockCompanyWebpLogo,
  Status: mockJobStatusInterview,
  Location: mockJobLocationNewYork,
  JobSource: mockJobSourceCareerPage,
  jobType: "FT",
  createdAt: new Date("2024-05-20T09:00:00.000Z"),
  appliedDate: new Date("2024-05-22T10:00:00.000Z"),
  dueDate: new Date("2024-06-30T00:00:00.000Z"),
  salaryRange: "$120,000 - $150,000",
  description: "Software Engineer interview stage at Vercel.",
  jobUrl: "https://vercel.com/careers/software-engineer",
  applied: true,
  tags: [mockTagTypescript],
};

export const mockJobOffer: JobResponse = {
  id: "job-offer-id",
  userId: mockUser.id,
  JobTitle: mockJobTitleDevOps,
  Company: mockCompany,
  Status: mockJobStatusOffer,
  Location: mockJobLocation,
  JobSource: mockJobSourceIndeed,
  jobType: "FT",
  createdAt: new Date("2024-04-01T09:00:00.000Z"),
  appliedDate: new Date("2024-04-05T10:00:00.000Z"),
  dueDate: new Date("2024-06-01T00:00:00.000Z"),
  salaryRange: "$110,000 - $140,000",
  description: "DevOps Engineer role at Acme Corp — offer received!",
  jobUrl: "https://example.com/jobs/devops",
  applied: true,
  tags: [mockTagKubernetes],
};

export const mockJobRejected: JobResponse = {
  id: "job-rejected-id",
  userId: mockUser.id,
  JobTitle: mockJobTitleDataEngineer,
  Company: mockCompanySvgInline,
  Status: mockJobStatusRejected,
  Location: mockJobLocationBerlin,
  JobSource: mockJobSourceGlassdoor,
  jobType: "C",
  createdAt: new Date("2024-03-10T09:00:00.000Z"),
  appliedDate: new Date("2024-03-15T10:00:00.000Z"),
  dueDate: new Date("2024-04-15T00:00:00.000Z"),
  salaryRange: "$70,000 - $90,000",
  description: "Contract data engineer position at Shopify — rejected after final round.",
  jobUrl: "https://shopify.com/careers/data-engineer",
  applied: true,
  tags: [mockTagPython],
};

export const mockJobPartTime: JobResponse = {
  id: "job-parttime-id",
  userId: mockUser.id,
  JobTitle: mockJobTitleFrontend,
  Company: mockCompanyIcoLogo,
  Status: mockJobStatus,
  Location: mockJobLocationLondon,
  JobSource: mockJobSource,
  jobType: "PT",
  createdAt: new Date("2024-06-10T09:00:00.000Z"),
  appliedDate: new Date("2024-06-12T10:00:00.000Z"),
  dueDate: new Date("2024-07-10T00:00:00.000Z"),
  salaryRange: "$40,000 - $55,000",
  description: "Part-time frontend developer at Stack Overflow.",
  jobUrl: "https://stackoverflow.com/jobs/frontend",
  applied: true,
  tags: [mockTagReact],
};

export const mockJobs: JobResponse[] = [
  mockJob,
  mockJobDraft,
  mockJobInterview,
  mockJobOffer,
  mockJobRejected,
  mockJobPartTime,
];

// ─── Additional Activity Types ────────────────────────────────────────────

export const mockActivityTypeCoding: ActivityType = {
  id: "activity-type-coding-id",
  label: "Coding",
  value: "Coding",
  description: null,
  createdBy: mockUser.id,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
};

export const mockActivityTypeJobSearch: ActivityType = {
  id: "activity-type-job-search-id",
  label: "Job Search",
  value: "Job Search",
  description: null,
  createdBy: mockUser.id,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
};

export const mockActivityTypeInterviewPrep: ActivityType = {
  id: "activity-type-interview-prep-id",
  label: "Interview Preparation",
  value: "Interview Preparation",
  description: null,
  createdBy: mockUser.id,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
};

export const mockActivityTypeSideProject: ActivityType = {
  id: "activity-type-side-project-id",
  label: "Side Project 1",
  value: "Side Project 1",
  description: null,
  createdBy: mockUser.id,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
};

export const mockActivityTypeNetworking: ActivityType = {
  id: "activity-type-networking-id",
  label: "Networking",
  value: "Networking",
  description: "Attending meetups, conferences, or reaching out to contacts",
  createdBy: mockUser.id,
  createdAt: new Date("2024-02-15T00:00:00.000Z"),
  updatedAt: new Date("2024-02-15T00:00:00.000Z"),
};

// ─── Diverse Activities ───────────────────────────────────────────────────

export const mockActivityCoding: Activity = {
  id: "activity-coding-id",
  activityTypeId: mockActivityTypeCoding.id,
  activityType: mockActivityTypeCoding,
  userId: mockUser.id,
  activityName: "Build Portfolio Website",
  startTime: new Date("2024-06-18T14:00:00.000Z"),
  endTime: new Date("2024-06-18T17:30:00.000Z"),
  duration: 210,
  description: "[MOCK_DATA] Build Portfolio Website",
  taskId: null,
  createdAt: new Date("2024-06-18T14:00:00.000Z"),
  updatedAt: new Date("2024-06-18T17:30:00.000Z"),
};

export const mockActivityJobSearch: Activity = {
  id: "activity-job-search-id",
  activityTypeId: mockActivityTypeJobSearch.id,
  activityType: mockActivityTypeJobSearch,
  userId: mockUser.id,
  activityName: "Research Companies",
  startTime: new Date("2024-06-19T08:00:00.000Z"),
  endTime: new Date("2024-06-19T09:30:00.000Z"),
  duration: 90,
  description: "[MOCK_DATA] Research Companies",
  taskId: null,
  createdAt: new Date("2024-06-19T08:00:00.000Z"),
  updatedAt: new Date("2024-06-19T09:30:00.000Z"),
};

export const mockActivityInterviewPrep: Activity = {
  id: "activity-interview-prep-id",
  activityTypeId: mockActivityTypeInterviewPrep.id,
  activityType: mockActivityTypeInterviewPrep,
  userId: mockUser.id,
  activityName: "System Design Review",
  startTime: new Date("2024-06-20T10:00:00.000Z"),
  endTime: new Date("2024-06-20T12:00:00.000Z"),
  duration: 120,
  description: "[MOCK_DATA] System Design Review",
  taskId: null,
  createdAt: new Date("2024-06-20T10:00:00.000Z"),
  updatedAt: new Date("2024-06-20T12:00:00.000Z"),
};

export const mockActivityNetworking: Activity = {
  id: "activity-networking-id",
  activityTypeId: mockActivityTypeNetworking.id,
  activityType: mockActivityTypeNetworking,
  userId: mockUser.id,
  activityName: "Attend Local Tech Meetup",
  startTime: new Date("2024-06-17T18:00:00.000Z"),
  endTime: new Date("2024-06-17T20:30:00.000Z"),
  duration: 150,
  description: "[MOCK_DATA] Attend Local Tech Meetup",
  taskId: null,
  createdAt: new Date("2024-06-17T18:00:00.000Z"),
  updatedAt: new Date("2024-06-17T20:30:00.000Z"),
};

export const mockActivitySideProject: Activity = {
  id: "activity-side-project-id",
  activityTypeId: mockActivityTypeSideProject.id,
  activityType: mockActivityTypeSideProject,
  userId: mockUser.id,
  activityName: "Implement New Features",
  startTime: new Date("2024-06-16T19:00:00.000Z"),
  endTime: new Date("2024-06-16T21:00:00.000Z"),
  duration: 120,
  description: "[MOCK_DATA] Implement New Features",
  taskId: null,
  createdAt: new Date("2024-06-16T19:00:00.000Z"),
  updatedAt: new Date("2024-06-16T21:00:00.000Z"),
};

export const mockActivityShortSession: Activity = {
  id: "activity-short-id",
  activityTypeId: mockActivityType.id,
  activityType: mockActivityType,
  userId: mockUser.id,
  activityName: "Quick React Hooks Review",
  startTime: new Date("2024-06-19T12:00:00.000Z"),
  endTime: new Date("2024-06-19T12:25:00.000Z"),
  duration: 25,
  description: "[MOCK_DATA] Quick React Hooks Review",
  taskId: null,
  createdAt: new Date("2024-06-19T12:00:00.000Z"),
  updatedAt: new Date("2024-06-19T12:25:00.000Z"),
};

export const mockActivities: Activity[] = [
  mockActivity,
  mockActivityCoding,
  mockActivityJobSearch,
  mockActivityInterviewPrep,
  mockActivityNetworking,
  mockActivitySideProject,
  mockActivityShortSession,
];

// ─── Diverse Tasks ────────────────────────────────────────────────────────

export const mockTaskComplete: Task = {
  id: "task-complete-id",
  userId: mockUser.id,
  title: "Submit portfolio website",
  description: "Final review and deploy portfolio to production.",
  status: "complete",
  priority: 2,
  percentComplete: 100,
  dueDate: new Date("2024-06-20T00:00:00.000Z"),
  activityTypeId: mockActivityTypeCoding.id,
  createdAt: new Date("2024-05-01T08:00:00.000Z"),
  updatedAt: new Date("2024-06-20T15:00:00.000Z"),
};

export const mockTaskNeedsAttention: Task = {
  id: "task-needs-attention-id",
  userId: mockUser.id,
  title: "Follow up with recruiter at Vercel",
  description: "Haven't heard back in 2 weeks — send a polite follow-up email.",
  status: "needs-attention",
  priority: 0,
  percentComplete: 10,
  dueDate: new Date("2024-06-25T00:00:00.000Z"),
  activityTypeId: mockActivityTypeJobSearch.id,
  createdAt: new Date("2024-06-10T08:00:00.000Z"),
  updatedAt: new Date("2024-06-22T09:00:00.000Z"),
};

export const mockTaskCancelled: Task = {
  id: "task-cancelled-id",
  userId: mockUser.id,
  title: "Prepare for cancelled on-site interview",
  description: "The company cancelled the role — no longer needed.",
  status: "cancelled",
  priority: 3,
  percentComplete: 25,
  dueDate: new Date("2024-06-18T00:00:00.000Z"),
  activityTypeId: mockActivityTypeInterviewPrep.id,
  createdAt: new Date("2024-06-05T08:00:00.000Z"),
  updatedAt: new Date("2024-06-15T10:00:00.000Z"),
};

export const mockTaskHighPriority: Task = {
  id: "task-high-priority-id",
  userId: mockUser.id,
  title: "Complete take-home coding challenge",
  description: "Build a REST API with Node.js and deploy to Vercel. Due in 48 hours.",
  status: "in-progress",
  priority: 0,
  percentComplete: 65,
  dueDate: new Date("2024-06-24T00:00:00.000Z"),
  activityTypeId: mockActivityTypeCoding.id,
  createdAt: new Date("2024-06-22T08:00:00.000Z"),
  updatedAt: new Date("2024-06-23T16:00:00.000Z"),
};

export const mockTaskNoDueDate: Task = {
  id: "task-no-duedate-id",
  userId: mockUser.id,
  title: "Learn Rust basics",
  description: null,
  status: "in-progress",
  priority: 3,
  percentComplete: 15,
  dueDate: null,
  activityTypeId: mockActivityType.id,
  createdAt: new Date("2024-06-01T08:00:00.000Z"),
  updatedAt: new Date("2024-06-19T08:00:00.000Z"),
};

export const mockTasks: Task[] = [
  mockTask,
  mockTaskComplete,
  mockTaskNeedsAttention,
  mockTaskCancelled,
  mockTaskHighPriority,
  mockTaskNoDueDate,
];

// ─── Questions ────────────────────────────────────────────────────────────

export const mockQuestionBehavioral: Question = {
  id: "question-behavioral-id",
  question: "Tell me about a time you handled a conflict in your team.",
  answer:
    "In my previous role, two team members disagreed on the approach for a key feature. " +
    "I facilitated a meeting where each person presented their perspective with data. " +
    "We identified the strengths of both approaches and created a hybrid solution that " +
    "satisfied both parties and ultimately delivered a better outcome.",
  createdBy: mockUser.id,
  tags: [],
  createdAt: new Date("2024-05-10T08:00:00.000Z"),
  updatedAt: new Date("2024-05-10T08:00:00.000Z"),
};

export const mockQuestionSystemDesign: Question = {
  id: "question-system-design-id",
  question: "Design a URL shortener like bit.ly.",
  answer:
    "Key components: 1) A hash function to generate unique short codes from long URLs. " +
    "2) A database (e.g. DynamoDB) to store mappings. 3) A redirect service that resolves " +
    "short codes to original URLs. 4) Analytics tracking for click counts. Scale considerations " +
    "include caching popular URLs in Redis and partitioning the database by hash prefix.",
  createdBy: mockUser.id,
  tags: [mockTagSystemDesign],
  createdAt: new Date("2024-05-15T10:00:00.000Z"),
  updatedAt: new Date("2024-06-01T14:00:00.000Z"),
};

export const mockQuestionReact: Question = {
  id: "question-react-id",
  question: "What is the difference between useEffect and useLayoutEffect?",
  answer:
    "useEffect runs asynchronously after the browser paints, suitable for data fetching and " +
    "subscriptions. useLayoutEffect runs synchronously after DOM mutations but before the " +
    "browser paints, suitable for reading layout and synchronously re-rendering.",
  createdBy: mockUser.id,
  tags: [mockTagReact, mockTagTypescript],
  createdAt: new Date("2024-04-20T08:00:00.000Z"),
  updatedAt: new Date("2024-04-20T08:00:00.000Z"),
};

export const mockQuestionPython: Question = {
  id: "question-python-id",
  question: "Explain Python's GIL and how to work around it for CPU-bound tasks.",
  answer:
    "The Global Interpreter Lock (GIL) prevents multiple native threads from executing Python " +
    "bytecode simultaneously. For CPU-bound tasks, use multiprocessing (separate processes with " +
    "their own GIL), C extensions that release the GIL, or alternative interpreters like PyPy.",
  createdBy: mockUser.id,
  tags: [mockTagPython],
  createdAt: new Date("2024-03-01T08:00:00.000Z"),
  updatedAt: new Date("2024-03-15T12:00:00.000Z"),
};

export const mockQuestionUnanswered: Question = {
  id: "question-unanswered-id",
  question: "How would you implement a rate limiter for a distributed API?",
  answer: null,
  createdBy: mockUser.id,
  tags: [mockTagSystemDesign, mockTagPython],
  createdAt: new Date("2024-06-18T08:00:00.000Z"),
  updatedAt: new Date("2024-06-18T08:00:00.000Z"),
};

export const mockQuestionKubernetes: Question = {
  id: "question-k8s-id",
  question: "What is the difference between a Deployment and a StatefulSet in Kubernetes?",
  answer:
    "Deployments manage stateless pods with interchangeable replicas. StatefulSets manage " +
    "stateful pods with stable network identities, persistent storage, and ordered deployment/scaling. " +
    "Use StatefulSets for databases, message queues, and other stateful workloads.",
  createdBy: mockUser.id,
  tags: [mockTagKubernetes],
  createdAt: new Date("2024-06-05T08:00:00.000Z"),
  updatedAt: new Date("2024-06-10T16:00:00.000Z"),
};

export const mockQuestions: Question[] = [
  mockQuestionBehavioral,
  mockQuestionSystemDesign,
  mockQuestionReact,
  mockQuestionPython,
  mockQuestionUnanswered,
  mockQuestionKubernetes,
];

// ─── Diverse Automations ──────────────────────────────────────────────────

export const mockAutomationPaused: Automation = {
  id: "automation-paused-id",
  userId: mockUser.id,
  name: "Weekly Frontend Developer Search",
  jobBoard: "eures",
  keywords: "frontend developer react",
  location: "Berlin, Germany",
  resumeId: mockResume.id!,
  matchThreshold: 60,
  scheduleHour: 10,
  scheduleFrequency: "weekly",
  nextRunAt: null,
  lastRunAt: new Date("2024-06-15T10:00:00.000Z"),
  connectorParams: null,
  status: "paused",
  pauseReason: "module_deactivated",
  createdAt: new Date("2024-05-01T00:00:00.000Z"),
  updatedAt: new Date("2024-06-15T10:00:00.000Z"),
};

export const mockAutomationEures: Automation = {
  id: "automation-eures-id",
  userId: mockUser.id,
  name: "EURES Data Engineer Search",
  jobBoard: "eures",
  keywords: "data engineer python spark",
  location: "Amsterdam, Netherlands",
  resumeId: mockResume.id!,
  matchThreshold: 75,
  scheduleHour: 6,
  scheduleFrequency: "12h",
  nextRunAt: new Date("2024-06-21T06:00:00.000Z"),
  lastRunAt: new Date("2024-06-20T06:00:00.000Z"),
  connectorParams: null,
  status: "active",
  pauseReason: null,
  createdAt: new Date("2024-06-10T00:00:00.000Z"),
  updatedAt: new Date("2024-06-20T06:00:00.000Z"),
};

export const mockAutomationHighThreshold: Automation = {
  id: "automation-high-threshold-id",
  userId: mockUser.id,
  name: "Senior Full Stack - Exact Match",
  jobBoard: "jsearch",
  keywords: "senior full stack developer typescript next.js",
  location: "Remote",
  resumeId: mockResume.id!,
  matchThreshold: 90,
  scheduleHour: 12,
  scheduleFrequency: "daily",
  nextRunAt: new Date("2024-06-21T12:00:00.000Z"),
  lastRunAt: new Date("2024-06-20T12:00:00.000Z"),
  connectorParams: null,
  status: "active",
  pauseReason: null,
  createdAt: new Date("2024-06-15T00:00:00.000Z"),
  updatedAt: new Date("2024-06-20T12:00:00.000Z"),
};

export const mockAutomationNeverRun: Automation = {
  id: "automation-never-run-id",
  userId: mockUser.id,
  name: "DevOps Engineer Search (New)",
  jobBoard: "jsearch",
  keywords: "devops engineer kubernetes terraform",
  location: "San Francisco, CA",
  resumeId: mockResume.id!,
  matchThreshold: 65,
  scheduleHour: 7,
  scheduleFrequency: "2d",
  nextRunAt: new Date("2024-06-22T07:00:00.000Z"),
  lastRunAt: null,
  connectorParams: null,
  status: "active",
  pauseReason: null,
  createdAt: new Date("2024-06-21T00:00:00.000Z"),
  updatedAt: new Date("2024-06-21T00:00:00.000Z"),
};

export const mockAutomations: Automation[] = [
  mockAutomation,
  mockAutomationPaused,
  mockAutomationEures,
  mockAutomationHighThreshold,
  mockAutomationNeverRun,
];

// ─── Connector / Module Mock Data ─────────────────────────────────────────

export interface MockConnectorModule {
  id: string;
  connectorId: string;
  connectorType: "job-discovery" | "ai-provider";
  moduleName: string;
  displayName: string;
  enabled: boolean;
  healthStatus: "healthy" | "degraded" | "unhealthy" | "unknown";
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  errorMessage: string | null;
  config: Record<string, unknown>;
}

export interface MockConnector {
  id: string;
  type: "job-discovery" | "ai-provider";
  name: string;
  enabled: boolean;
  modules: MockConnectorModule[];
}

export const mockModuleEures: MockConnectorModule = {
  id: "module-eures-id",
  connectorId: "connector-job-discovery-id",
  connectorType: "job-discovery",
  moduleName: "eures",
  displayName: "EURES",
  enabled: true,
  healthStatus: "healthy",
  lastCheckedAt: new Date("2024-06-20T08:00:00.000Z"),
  lastSuccessAt: new Date("2024-06-20T08:00:00.000Z"),
  errorMessage: null,
  config: { defaultLanguage: "en", maxResults: 100 },
};

export const mockModuleJSearch: MockConnectorModule = {
  id: "module-jsearch-id",
  connectorId: "connector-job-discovery-id",
  connectorType: "job-discovery",
  moduleName: "jsearch",
  displayName: "JSearch (RapidAPI)",
  enabled: true,
  healthStatus: "healthy",
  lastCheckedAt: new Date("2024-06-20T08:05:00.000Z"),
  lastSuccessAt: new Date("2024-06-20T08:05:00.000Z"),
  errorMessage: null,
  config: { apiKey: "***masked***", rateLimit: 100 },
};

export const mockModuleArbeitsagentur: MockConnectorModule = {
  id: "module-arbeitsagentur-id",
  connectorId: "connector-job-discovery-id",
  connectorType: "job-discovery",
  moduleName: "arbeitsagentur",
  displayName: "Bundesagentur fur Arbeit",
  enabled: false,
  healthStatus: "unknown",
  lastCheckedAt: null,
  lastSuccessAt: null,
  errorMessage: null,
  config: { defaultRadius: 50 },
};

export const mockModuleOllama: MockConnectorModule = {
  id: "module-ollama-id",
  connectorId: "connector-ai-provider-id",
  connectorType: "ai-provider",
  moduleName: "ollama",
  displayName: "Ollama (Local)",
  enabled: true,
  healthStatus: "healthy",
  lastCheckedAt: new Date("2024-06-20T08:10:00.000Z"),
  lastSuccessAt: new Date("2024-06-20T08:10:00.000Z"),
  errorMessage: null,
  config: { baseUrl: "http://localhost:11434", model: "llama3" },
};

export const mockModuleOpenAI: MockConnectorModule = {
  id: "module-openai-id",
  connectorId: "connector-ai-provider-id",
  connectorType: "ai-provider",
  moduleName: "openai",
  displayName: "OpenAI",
  enabled: true,
  healthStatus: "degraded",
  lastCheckedAt: new Date("2024-06-20T08:12:00.000Z"),
  lastSuccessAt: new Date("2024-06-19T22:00:00.000Z"),
  errorMessage: "Rate limit exceeded — retrying in 60s",
  config: { apiKey: "***masked***", model: "gpt-4o", maxTokens: 4096 },
};

export const mockModuleDeepSeek: MockConnectorModule = {
  id: "module-deepseek-id",
  connectorId: "connector-ai-provider-id",
  connectorType: "ai-provider",
  moduleName: "deepseek",
  displayName: "DeepSeek",
  enabled: false,
  healthStatus: "unhealthy",
  lastCheckedAt: new Date("2024-06-18T08:00:00.000Z"),
  lastSuccessAt: null,
  errorMessage: "Connection refused — verify API endpoint",
  config: { apiKey: "***masked***", model: "deepseek-coder" },
};

export const mockConnectorJobDiscovery: MockConnector = {
  id: "connector-job-discovery-id",
  type: "job-discovery",
  name: "Job Discovery",
  enabled: true,
  modules: [mockModuleEures, mockModuleJSearch, mockModuleArbeitsagentur],
};

export const mockConnectorAIProvider: MockConnector = {
  id: "connector-ai-provider-id",
  type: "ai-provider",
  name: "AI Provider",
  enabled: true,
  modules: [mockModuleOllama, mockModuleOpenAI, mockModuleDeepSeek],
};

export const mockConnectors: MockConnector[] = [
  mockConnectorJobDiscovery,
  mockConnectorAIProvider,
];

// ─── Staged Vacancy ──────────────────────────────────────────────────────

export const mockStagedVacancy: StagedVacancy = {
  id: "staged-vacancy-1",
  userId: mockUser.id,
  sourceBoard: "eures",
  externalId: "eures-job-12345",
  sourceUrl: "https://europa.eu/eures/portal/jv-se/jv-details/eures-job-12345",
  title: "Senior Software Engineer",
  employerName: "TechCorp GmbH",
  location: "Berlin, Germany",
  description: "Full-stack development role...",
  salary: "\u20AC60,000 - \u20AC80,000",
  employmentType: "full_time",
  postedAt: new Date("2026-03-15"),
  applicationDeadline: "2026-04-15",
  applicationInstructions: null,
  companyUrl: "www.techcorp.de",
  companyDescription: null,
  industryCodes: ["J"],
  companySize: null,
  positionOfferingCode: "directhire",
  numberOfPosts: 1,
  occupationUris: ["http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1"],
  requiredEducationLevel: "bachelor",
  requiredExperienceYears: 3,
  workingLanguages: ["de", "en"],
  salaryMin: 60000,
  salaryMax: 80000,
  salaryCurrency: "EUR",
  salaryPeriod: "yearly",
  immediateStart: false,
  contractStartDate: null,
  contractEndDate: null,
  euresFlag: false,
  source: "automation",
  automationId: mockAutomation.id,
  matchScore: 85,
  matchData: JSON.stringify({ score: 85, recommendation: "Strong match" }),
  status: "staged",
  promotedToJobId: null,
  archivedAt: null,
  trashedAt: null,
  discoveredAt: new Date("2026-03-20"),
  createdAt: new Date("2026-03-20"),
  updatedAt: new Date("2026-03-20"),
};

export const mockStagedVacancyDismissed: StagedVacancy = {
  ...mockStagedVacancy,
  id: "staged-vacancy-2",
  externalId: "eures-job-67890",
  title: "Junior Developer",
  status: "dismissed",
  matchScore: 40,
};

export const mockStagedVacancyPromoted: StagedVacancy = {
  ...mockStagedVacancy,
  id: "staged-vacancy-3",
  externalId: "eures-job-11111",
  title: "DevOps Engineer",
  status: "promoted",
  promotedToJobId: "job-promoted-1",
};

export const mockStagedVacancyProcessing: StagedVacancy = {
  ...mockStagedVacancy,
  id: "staged-vacancy-4",
  externalId: "eures-job-22222",
  title: "Backend Developer",
  status: "processing",
};

export const mockStagedVacancyReady: StagedVacancy = {
  ...mockStagedVacancy,
  id: "staged-vacancy-5",
  externalId: "eures-job-33333",
  title: "Frontend Developer",
  status: "ready",
  matchScore: 92,
};

// ─── Logo Asset ───────────────────────────────────────────────────────────

export interface LogoAssetFixture {
  id: string;
  userId: string;
  companyId: string;
  sourceUrl: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const mockLogoAsset: LogoAssetFixture = {
  id: "logo-asset-fixture-id",
  userId: mockUser.id,
  companyId: mockCompany.id,
  sourceUrl: "https://img.logo.dev/acme.com?format=png",
  filePath: "/data/logos/logo-asset-fixture-id.png",
  mimeType: "image/png",
  fileSize: 24576,
  width: 256,
  height: 256,
  status: "ready",
  errorMessage: null,
  createdAt: new Date("2026-04-06T10:00:00.000Z"),
  updatedAt: new Date("2026-04-06T10:00:00.000Z"),
};

export const mockLogoAssetPending: LogoAssetFixture = {
  ...mockLogoAsset,
  id: "logo-asset-pending-id",
  companyId: mockCompanySvgLogo.id,
  sourceUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  filePath: "/data/logos/logo-asset-pending-id.png",
  status: "pending",
  fileSize: 0,
  width: null,
  height: null,
};

export const mockLogoAssetFailed: LogoAssetFixture = {
  ...mockLogoAsset,
  id: "logo-asset-failed-id",
  companyId: mockCompanyNoLogo.id,
  sourceUrl: "https://example.com/broken-logo.png",
  filePath: "/data/logos/logo-asset-failed-id.png",
  status: "failed",
  errorMessage: "Download failed: 404 Not Found",
  fileSize: 0,
  width: null,
  height: null,
};

export const mockLogoAssetSvg: LogoAssetFixture = {
  ...mockLogoAsset,
  id: "logo-asset-svg-id",
  companyId: mockCompanySvgInline.id,
  sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/0/0e/Shopify_logo_2018.svg",
  filePath: "/data/logos/logo-asset-svg-id.svg",
  mimeType: "image/svg+xml",
  fileSize: 4096,
  width: null,
  height: null,
};

// ─── Enrichment Result ───────────────────────────────────────────────────

export interface EnrichmentResultFixture {
  id: string;
  userId: string;
  dimension: string;
  domainKey: string;
  companyId: string | null;
  status: string;
  data: string;
  sourceModuleId: string;
  ttlSeconds: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const mockEnrichmentResult: EnrichmentResultFixture = {
  id: "enrichment-result-fixture-id",
  userId: mockUser.id,
  dimension: "logo",
  domainKey: "acme.com",
  companyId: mockCompany.id,
  status: "found",
  data: JSON.stringify({ logoUrl: "https://img.logo.dev/acme.com?format=png" }),
  sourceModuleId: "logo_dev",
  ttlSeconds: 2592000,
  expiresAt: new Date("2026-05-06T10:00:00.000Z"),
  createdAt: new Date("2026-04-06T10:00:00.000Z"),
  updatedAt: new Date("2026-04-06T10:00:00.000Z"),
};

export const mockEnrichmentResultNotFound: EnrichmentResultFixture = {
  ...mockEnrichmentResult,
  id: "enrichment-result-not-found-id",
  status: "not_found",
  data: JSON.stringify({}),
  sourceModuleId: "google_favicon",
};

export const mockEnrichmentResultDeepLink: EnrichmentResultFixture = {
  ...mockEnrichmentResult,
  id: "enrichment-result-deep-link-id",
  dimension: "deep_link",
  status: "found",
  data: JSON.stringify({
    title: "Acme Corp - Careers",
    description: "Join our team at Acme Corp",
    ogImage: "https://acme.com/og-image.png",
  }),
  sourceModuleId: "meta_parser",
};

// ─── Enrichment Log ──────────────────────────────────────────────────────

export interface EnrichmentLogFixture {
  id: string;
  userId: string;
  enrichmentResultId: string | null;
  dimension: string;
  domainKey: string;
  moduleId: string;
  chainPosition: number;
  outcome: string;
  latencyMs: number;
  errorMessage: string | null;
  createdAt: Date;
}

export const mockEnrichmentLog: EnrichmentLogFixture = {
  id: "enrichment-log-fixture-id",
  userId: mockUser.id,
  enrichmentResultId: mockEnrichmentResult.id,
  dimension: "logo",
  domainKey: "acme.com",
  moduleId: "logo_dev",
  chainPosition: 1,
  outcome: "found",
  latencyMs: 245,
  errorMessage: null,
  createdAt: new Date("2026-04-06T10:00:00.000Z"),
};

export const mockEnrichmentLogFailed: EnrichmentLogFixture = {
  ...mockEnrichmentLog,
  id: "enrichment-log-failed-id",
  moduleId: "google_favicon",
  chainPosition: 2,
  outcome: "error",
  latencyMs: 5012,
  errorMessage: "Timeout after 5000ms",
};

export const mockEnrichmentLogSkipped: EnrichmentLogFixture = {
  ...mockEnrichmentLog,
  id: "enrichment-log-skipped-id",
  moduleId: "meta_parser",
  chainPosition: 3,
  outcome: "skipped",
  latencyMs: 0,
  errorMessage: null,
};
