export const RETENTION_CONFIG = {
  notificationRetentionDays: 30,
  enrichmentLogRetentionDays: 90,
  stagedVacancyRetentionDays: 30,
  adminAuditLogRetentionDays: 365,
  crmActivityLogRetentionDays: 1095,
  logoAssetOrphanGraceDays: 7,
} as const;
