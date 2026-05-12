/**
 * i18n dictionary for Email Template Strings.
 * Namespace: "email"
 *
 * Contains:
 * - Email template structure (header, footer, greeting)
 * - Test email strings
 * - Per-NotificationType email subjects
 *
 * SMTP configuration UI → smtp.ts
 * Push notification UI → push.ts
 */
export const email = {
  en: {
    // Email template structure
    "email.header": "JobSync Notification",
    "email.footer": "This email was sent by JobSync. Manage your notification settings in the app.",
    "email.greeting": "Hello,",
    "email.testSubject": "JobSync Test Email",
    "email.testBody": "This is a test email from JobSync. Your SMTP configuration is working correctly.",

    // Per-NotificationType subjects
    "email.subject.module_deactivated": "Module deactivated",
    "email.subject.module_reactivated": "Module reactivated",
    "email.subject.module_unreachable": "Module unreachable",
    "email.subject.cb_escalation": "Circuit breaker escalation",
    "email.subject.consecutive_failures": "Consecutive run failures",
    "email.subject.auth_failure": "Authentication failure",
    "email.subject.vacancy_promoted": "Vacancy promoted to job",
    "email.subject.vacancy_batch_staged": "New vacancies staged",
    "email.subject.bulk_action_completed": "Bulk action completed",
    "email.subject.retention_completed": "Retention cleanup completed",
    "email.subject.job_status_changed": "Job status changed",
    "email.subject.interview_scheduled": "Interview scheduled",
    "email.subject.interview_reminder": "Interview reminder",
    "email.subject.follow_up_due": "Follow-up due",
    "email.subject.contact_from_job": "New contact from job",
    "email.subject.retention_expired": "Contact archived — retention expired",
  },
  de: {
    "email.header": "JobSync-Benachrichtigung",
    "email.footer": "Diese E-Mail wurde von JobSync gesendet. Verwalte deine Benachrichtigungseinstellungen in der App.",
    "email.greeting": "Hallo,",
    "email.testSubject": "JobSync Test-E-Mail",
    "email.testBody": "Dies ist eine Test-E-Mail von JobSync. Deine SMTP-Konfiguration funktioniert korrekt.",

    "email.subject.module_deactivated": "Modul deaktiviert",
    "email.subject.module_reactivated": "Modul reaktiviert",
    "email.subject.module_unreachable": "Modul nicht erreichbar",
    "email.subject.cb_escalation": "Circuit-Breaker-Eskalation",
    "email.subject.consecutive_failures": "Aufeinanderfolgende Fehler",
    "email.subject.auth_failure": "Authentifizierungsfehler",
    "email.subject.vacancy_promoted": "Stellenangebot zum Job bef\u00f6rdert",
    "email.subject.vacancy_batch_staged": "Neue Stellenangebote bereitgestellt",
    "email.subject.bulk_action_completed": "Massenaktion abgeschlossen",
    "email.subject.retention_completed": "Aufbewahrungsbereinigung abgeschlossen",
    "email.subject.job_status_changed": "Job-Status ge\u00e4ndert",
    "email.subject.interview_scheduled": "Interview geplant",
    "email.subject.interview_reminder": "Interview-Erinnerung",
    "email.subject.follow_up_due": "Follow-up fällig",
    "email.subject.contact_from_job": "Neuer Kontakt aus Job",
    "email.subject.retention_expired": "Kontakt archiviert — Aufbewahrungsfrist abgelaufen",
  },
  fr: {
    "email.header": "Notification JobSync",
    "email.footer": "Cet e-mail a \u00e9t\u00e9 envoy\u00e9 par JobSync. G\u00e9rez vos param\u00e8tres de notification dans l'application.",
    "email.greeting": "Bonjour,",
    "email.testSubject": "E-mail de test JobSync",
    "email.testBody": "Ceci est un e-mail de test de JobSync. Votre configuration SMTP fonctionne correctement.",

    "email.subject.module_deactivated": "Module d\u00e9sactiv\u00e9",
    "email.subject.module_reactivated": "Module r\u00e9activ\u00e9",
    "email.subject.module_unreachable": "Module injoignable",
    "email.subject.cb_escalation": "Escalade du disjoncteur",
    "email.subject.consecutive_failures": "\u00c9checs cons\u00e9cutifs",
    "email.subject.auth_failure": "\u00c9chec d'authentification",
    "email.subject.vacancy_promoted": "Offre promue en emploi",
    "email.subject.vacancy_batch_staged": "Nouvelles offres mises en attente",
    "email.subject.bulk_action_completed": "Action group\u00e9e termin\u00e9e",
    "email.subject.retention_completed": "Nettoyage de r\u00e9tention termin\u00e9",
    "email.subject.job_status_changed": "Statut de l'emploi modifi\u00e9",
    "email.subject.interview_scheduled": "Entretien programmé",
    "email.subject.interview_reminder": "Rappel d'entretien",
    "email.subject.follow_up_due": "Suivi à effectuer",
    "email.subject.contact_from_job": "Nouveau contact depuis l'emploi",
    "email.subject.retention_expired": "Contact archivé — rétention expirée",
  },
  es: {
    "email.header": "Notificaci\u00f3n de JobSync",
    "email.footer": "Este correo fue enviado por JobSync. Gestiona tus ajustes de notificaci\u00f3n en la aplicaci\u00f3n.",
    "email.greeting": "Hola,",
    "email.testSubject": "Correo de prueba de JobSync",
    "email.testBody": "Este es un correo de prueba de JobSync. Tu configuraci\u00f3n SMTP funciona correctamente.",

    "email.subject.module_deactivated": "M\u00f3dulo desactivado",
    "email.subject.module_reactivated": "M\u00f3dulo reactivado",
    "email.subject.module_unreachable": "M\u00f3dulo inalcanzable",
    "email.subject.cb_escalation": "Escalaci\u00f3n del disyuntor",
    "email.subject.consecutive_failures": "Fallos consecutivos",
    "email.subject.auth_failure": "Error de autenticaci\u00f3n",
    "email.subject.vacancy_promoted": "Vacante promovida a empleo",
    "email.subject.vacancy_batch_staged": "Nuevas vacantes preparadas",
    "email.subject.bulk_action_completed": "Acci\u00f3n masiva completada",
    "email.subject.retention_completed": "Limpieza de retenci\u00f3n completada",
    "email.subject.job_status_changed": "Estado del empleo cambiado",
    "email.subject.interview_scheduled": "Entrevista programada",
    "email.subject.interview_reminder": "Recordatorio de entrevista",
    "email.subject.follow_up_due": "Seguimiento pendiente",
    "email.subject.contact_from_job": "Nuevo contacto del empleo",
    "email.subject.retention_expired": "Contacto archivado — retención expirada",
  },
} as const;
