import "server-only";

import db from "@/lib/db";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
import {
  parseEmails,
  parsePhones,
  parseCompanies,
  parseSocialProfiles,
} from "@/models/person.model";

/**
 * Collect ALL user-scoped data for GDPR Art. 15/20 export.
 *
 * Returns a structured object where each key is an aggregate name
 * and the value is the serializable data for that aggregate.
 *
 * Encrypted fields (ApiKey.encryptedKey, SMTP password, VAPID key,
 * WebhookEndpoint secret, WebPush keys, ConnectedAccount tokens)
 * are EXCLUDED via explicit `select`.
 *
 * JSON string fields (Person.emails/phones/companies/socialProfiles)
 * are parsed into structured objects.
 */
export async function collectUserData(userId: string) {
  // Run all queries in parallel for performance
  const [
    jobs,
    notes,
    activities,
    tasks,
    automations,
    automationRuns,
    notifications,
    stagedVacancies,
    questions,
    tags,
    companyBlacklist,
    jobStatusHistory,
    apiKeys,
    publicApiKeys,
    profiles,
    persons,
    crmInterviews,
    crmTasks,
    crmNotes,
    crmActivityLogs,
    crmBlocklist,
    jobContacts,
    enrichmentResults,
    enrichmentLogs,
    webhookEndpoints,
    logoAssets,
    userSettings,
    connectedAccounts,
    smtpConfig,
    vapidConfig,
    webPushSubscriptions,
    dedupHashes,
  ] = await Promise.all([
    // --- Pattern A: Direct userId ---
    db.job.findMany({
      where: { userId },
      select: {
        id: true,
        createdAt: true,
        applied: true,
        appliedDate: true,
        jobType: true,
        jobUrl: true,
        description: true,
        salaryRange: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryPeriod: true,
        salaryBonus: true,
        Company: { select: { label: true } },
        JobTitle: { select: { label: true } },
        Location: { select: { label: true } },
        JobSource: { select: { label: true } },
        Status: { select: { label: true, value: true } },
      },
    }),

    db.note.findMany({
      where: { userId },
      select: { id: true, content: true, jobId: true, createdAt: true },
    }),

    db.activity.findMany({
      where: { userId },
      select: {
        id: true,
        activityName: true,
        activityTypeId: true,
        startTime: true,
        endTime: true,
        duration: true,
        description: true,
        createdAt: true,
      },
    }),

    db.task.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
      },
    }),

    db.automation.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        jobBoard: true,
        keywords: true,
        location: true,
        connectorParams: true,
        matchThreshold: true,
        scheduleHour: true,
        scheduleFrequency: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),

    db.automationRun.findMany({
      where: { automation: { userId } },
      select: {
        id: true,
        automationId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        jobsSearched: true,
        jobsMatched: true,
        jobsSaved: true,
        errorMessage: true,
      },
    }),

    db.notification.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        message: true,
        data: true,
        titleKey: true,
        titleParams: true,
        read: true,
        createdAt: true,
      },
    }),

    db.stagedVacancy.findMany({
      where: { userId },
      select: {
        id: true,
        externalId: true,
        title: true,
        employerName: true,
        location: true,
        status: true,
        matchScore: true,
        createdAt: true,
      },
    }),

    db.question.findMany({
      where: { createdBy: userId },
      select: {
        id: true,
        question: true,
        answer: true,
        createdAt: true,
      },
    }),

    db.tag.findMany({
      where: { createdBy: userId },
      select: { id: true, label: true, value: true },
    }),

    db.companyBlacklist.findMany({
      where: { userId },
      select: { id: true, pattern: true, createdAt: true },
    }),

    db.jobStatusHistory.findMany({
      where: { userId },
      select: {
        id: true,
        jobId: true,
        previousStatusId: true,
        newStatusId: true,
        changedAt: true,
      },
    }),

    // ApiKey: EXCLUDE encrypted fields
    db.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        moduleId: true,
        last4: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
      },
    }),

    // PublicApiKey: EXCLUDE keyHash
    db.publicApiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
    }),

    // Profile + Resume chain
    db.profile.findMany({
      where: { userId },
      select: {
        id: true,
        resumes: {
          select: {
            id: true,
            title: true,
            createdAt: true,
            ContactInfo: {
              select: {
                firstName: true,
                lastName: true,
                headline: true,
                email: true,
                phone: true,
                address: true,
              },
            },
            ResumeSections: {
              select: {
                id: true,
                sectionTitle: true,
                sectionType: true,
                summary: { select: { content: true } },
                workExperiences: {
                  select: {
                    Company: { select: { label: true } },
                    jobTitle: { select: { label: true } },
                    location: { select: { label: true } },
                    startDate: true,
                    endDate: true,
                    description: true,
                  },
                },
                educations: {
                  select: {
                    institution: true,
                    degree: true,
                    fieldOfStudy: true,
                    startDate: true,
                    endDate: true,
                    description: true,
                  },
                },
              },
            },
            File: { select: { id: true, fileName: true, fileType: true } },
          },
        },
      },
    }),

    // CRM: Person with parsed JSON fields
    db.person.findMany({
      where: { userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        headline: true,
        emails: true,
        phones: true,
        companies: true,
        socialProfiles: true,
        status: true,
        dataSource: true,
        processingBasis: true,
        consentWithdrawnAt: true,
        retentionExpiresAt: true,
        createdAt: true,
      },
    }),

    db.crmInterview.findMany({
      where: { userId },
      select: {
        id: true,
        personId: true,
        jobId: true,
        status: true,
        interviewDate: true,
        notes: true,
        outcomeNotes: true,
        createdAt: true,
      },
    }),

    db.crmTask.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueDate: true,
        createdAt: true,
        targets: {
          select: {
            targetPersonId: true,
            targetCompanyId: true,
            targetJobId: true,
          },
        },
      },
    }),

    db.crmNote.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        targets: {
          select: {
            targetPersonId: true,
            targetCompanyId: true,
            targetJobId: true,
          },
        },
      },
    }),

    db.crmActivityLog.findMany({
      where: { userId },
      select: {
        id: true,
        activityType: true,
        details: true,
        happenedAt: true,
        targetPersonId: true,
        targetCompanyId: true,
        targetJobId: true,
      },
      take: 10000, // Cap for export size
    }),

    db.crmBlocklist.findMany({
      where: { userId },
      select: { id: true, handle: true, type: true, createdAt: true },
    }),

    db.jobContact.findMany({
      where: { userId },
      select: {
        id: true,
        personId: true,
        jobId: true,
        role: true,
        createdAt: true,
      },
    }),

    db.enrichmentResult.findMany({
      where: { userId },
      select: {
        id: true,
        dimension: true,
        domainKey: true,
        data: true,
        expiresAt: true,
        createdAt: true,
      },
    }),

    db.enrichmentLog.findMany({
      where: { userId },
      select: {
        id: true,
        dimension: true,
        domainKey: true,
        moduleId: true,
        outcome: true,
        latencyMs: true,
        createdAt: true,
      },
      take: 10000,
    }),

    // WebhookEndpoint: EXCLUDE encrypted secret
    db.webhookEndpoint.findMany({
      where: { userId },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        failureCount: true,
        createdAt: true,
      },
    }),

    // LogoAsset: metadata only, no binary
    db.logoAsset.findMany({
      where: { userId },
      select: {
        id: true,
        companyId: true,
        sourceUrl: true,
        mimeType: true,
        fileSize: true,
        status: true,
        createdAt: true,
      },
    }),

    // UserSettings
    db.userSettings.findFirst({
      where: { userId },
      select: { settings: true, createdAt: true, updatedAt: true },
    }),

    // ConnectedAccount: EXCLUDE encrypted tokens
    db.connectedAccount.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        handle: true,
        isSyncEnabled: true,
        createdAt: true,
      },
    }),

    // SmtpConfig: EXCLUDE encrypted password
    db.smtpConfig.findFirst({
      where: { userId },
      select: {
        id: true,
        host: true,
        port: true,
        username: true,
        fromAddress: true,
        tlsRequired: true,
        active: true,
        createdAt: true,
      },
    }),

    // VapidConfig: EXCLUDE encrypted privateKey
    db.vapidConfig.findFirst({
      where: { userId },
      select: {
        id: true,
        publicKey: true,
        createdAt: true,
      },
    }),

    // WebPushSubscription: EXCLUDE encrypted p256dh/auth
    db.webPushSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        endpoint: true,
        createdAt: true,
      },
    }),

    // DedupHash (count only — potentially large)
    db.dedupHash.count({ where: { userId } }),
  ]);

  // S6b: a full data export reads every Person's PII — the highest-sensitivity
  // PII read in the app. Audit one person.pii_read per exported Person
  // (specs/audit-trail.allium AuditPersonPiiRead names export as a covered entry
  // point). Fire-and-forget; never copies PII into the audit payload.
  for (const p of persons) {
    writeDataAuditLog({
      actorId: userId,
      action: "person.pii_read",
      targetType: "person",
      targetId: p.id,
    });
  }

  // Parse Person JSON fields
  const parsedPersons = persons.map((p: (typeof persons)[number]) => ({
    ...p,
    emails: parseEmails(p.emails as string),
    phones: parsePhones(p.phones as string),
    companies: parseCompanies(p.companies as string),
    socialProfiles: parseSocialProfiles(p.socialProfiles as string),
  }));

  return {
    jobs,
    notes,
    activities,
    tasks,
    automations,
    automationRuns,
    notifications,
    stagedVacancies,
    questions,
    tags,
    companyBlacklist,
    jobStatusHistory,
    apiKeys,
    publicApiKeys,
    profiles,
    persons: parsedPersons,
    crmInterviews,
    crmTasks,
    crmNotes,
    crmActivityLogs,
    crmBlocklist,
    jobContacts,
    enrichmentResults,
    enrichmentLogs,
    webhookEndpoints,
    logoAssets,
    userSettings,
    connectedAccounts,
    smtpConfig,
    vapidConfig,
    webPushSubscriptions,
    dedupHashCount: dedupHashes,
  };
}
