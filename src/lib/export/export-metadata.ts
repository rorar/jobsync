import "server-only";

/**
 * Build GDPR-mandated metadata for user data export.
 * Art. 15(1)(a-h): purposes, categories, recipients, retention, rights.
 */
export function buildExportMetadata(userEmail: string) {
  return {
    exportVersion: "1.0",
    exportedAt: new Date().toISOString(),
    dataSubjectEmail: userEmail,

    retentionPolicies: [
      { dataCategory: "notifications", retentionPeriod: "30 days", basis: "Art. 5(1)(e)" },
      { dataCategory: "enrichmentResults", retentionPeriod: "TTL-based (7-30 days per dimension)", basis: "Art. 5(1)(e)" },
      { dataCategory: "enrichmentLogs", retentionPeriod: "90 days", basis: "Art. 5(1)(e)" },
      { dataCategory: "stagedVacancies", retentionPeriod: "30 days after trash/dismiss", basis: "Art. 5(1)(e)" },
      { dataCategory: "adminAuditLogs", retentionPeriod: "365 days", basis: "Art. 5(1)(e)" },
      { dataCategory: "crmActivityLogs", retentionPeriod: "1095 days (3 years)", basis: "Art. 5(1)(e)" },
      { dataCategory: "crmAutoCreatedPersons", retentionPeriod: "730 days (2 years)", basis: "Art. 5(1)(e)" },
      { dataCategory: "userContent", retentionPeriod: "Until account deletion (no automatic TTL)", basis: "Art. 6(1)(b) contract" },
    ],

    processingPurposes: [
      { purpose: "jobTracking", legalBasis: "Art. 6(1)(b) contract", description: "Managing job applications and interview pipeline" },
      { purpose: "aiMatching", legalBasis: "Art. 6(1)(a) consent", description: "AI-assisted resume-to-job matching (PII stripped for cloud providers)" },
      { purpose: "dataEnrichment", legalBasis: "Art. 6(1)(f) legitimate interest", description: "Company logo and metadata enrichment from public sources" },
      { purpose: "crmContactManagement", legalBasis: "Art. 6(1)(f) legitimate interest", description: "CRM contact person management for job applications" },
    ],

    thirdPartyRecipients: [
      { name: "OpenAI", country: "US", purpose: "AI matching (resume text, PII stripped)", safeguard: "Standard Contractual Clauses (SCCs)" },
      { name: "DeepSeek", country: "CN", purpose: "AI matching (resume text, PII stripped)", safeguard: "Standard Contractual Clauses (SCCs)" },
      { name: "Logo.dev", country: "US", purpose: "Company logo enrichment (domain name only)", safeguard: "Standard Contractual Clauses (SCCs)" },
      { name: "EURES/ESCO", country: "EU", purpose: "Job discovery (no personal data transmitted)", safeguard: "EU institution (adequacy)" },
    ],

    dataCategories: [
      "jobs", "notes", "activities", "tasks", "automations", "automationRuns",
      "notifications", "stagedVacancies", "questions", "tags", "companyBlacklist",
      "jobStatusHistory", "apiKeys", "publicApiKeys", "profiles", "persons",
      "crmInterviews", "crmTasks", "crmNotes", "crmActivityLogs", "crmBlocklist",
      "jobContacts", "enrichmentResults", "enrichmentLogs", "webhookEndpoints",
      "logoAssets", "userSettings", "connectedAccounts",
    ],

    dataSubjectRights: {
      access: "Art. 15 GDPR — This export fulfills the right of access",
      portability: "Art. 20 GDPR — Data provided in structured, machine-readable JSON format",
      erasure: "Art. 17 GDPR — Account deletion available in Settings > Privacy & Security",
      rectification: "Art. 16 GDPR — Data can be corrected directly in the application",
    },
  };
}
