export const notifications = {
  en: {
    "notifications.title": "Notifications",
    "notifications.markAllRead": "Mark all as read",
    "notifications.noNotifications": "No notifications",
    "notifications.vacancyPromoted": "Job created from staged vacancy",
    "notifications.bulkActionCompleted": "{succeeded} items {actionType} successfully",
    "notifications.retentionCompleted": "{count} expired vacancies cleaned up",
    "notifications.moduleDeactivated": "Module {name} deactivated. {automationCount} automation(s) paused.",
    "notifications.moduleReactivated": "Module {name} reactivated. {automationCount} automation(s) remain paused.",
    "notifications.moduleUnreachable": "Module {name} is unreachable. {automationCount} automation(s) paused.",
    "notifications.cbEscalation": "Circuit breaker tripped for module {name}. {automationCount} automation(s) paused.",
    "notifications.consecutiveFailures": "Module {name} failed {failureCount} consecutive runs. {automationCount} automation(s) paused.",
    "notifications.authFailure": "Authentication failed for module {name}. {automationCount} automation(s) paused.",
    "notifications.batchStaged": "{count} new vacancies staged from \"{name}\"",
    "notifications.jobStatusChanged": "Job status changed to {newStatus}",
    "notifications.dismiss": "Dismiss",
    "notifications.viewJob": "View job",
    "notifications.viewAutomation": "View automation",

    // 5W+H rework — parametric titles (late-bound at render time)
    "notifications.moduleDeactivated.title": "Module paused: {moduleName}",
    "notifications.moduleReactivated.title": "Module reactivated: {moduleName}",
    "notifications.moduleUnreachable.title": "Module unreachable: {moduleName}",
    "notifications.cbEscalation.title": "Circuit breaker tripped",
    "notifications.consecutiveFailures.title": "{count} consecutive failures",
    "notifications.authFailure.title": "Authentication failed",
    "notifications.vacancyPromoted.title": "New job added",
    "notifications.vacancyBatchStaged.title": "{count} new vacancies from {automationName}",
    "notifications.bulkActionCompleted.title": "{action}: {count} items",
    "notifications.retentionCompleted.title": "Data retention complete",
    "notifications.jobStatusChanged.title": "Job status: {status}",
    // Sprint 4 L-A-03: webhook-channel direct-writer titles — follow the
    // `notifications.*.title` convention so they sit alongside the other
    // 5W+H writers. The bare `webhook.deliveryFailed` / `webhook.endpoint
    // Deactivated` keys (in `webhook.ts`) still power the English fallback
    // `message` column stored on the row.
    "notifications.webhook.deliveryFailed.title": "Webhook delivery failed",
    "notifications.webhook.endpointDeactivated.title": "Webhook endpoint deactivated",

    // Reason / context strings (shared vocabulary)
    "notifications.reason.moduleTimeout": "Module did not respond within the configured timeout",
    "notifications.reason.authExpired": "API key invalid or expired",
    "notifications.reason.circuitBreaker": "Too many failures, circuit breaker opened",
    "notifications.reason.manualDeactivation": "Deactivated by user",

    // Action button labels (shared vocabulary)
    "notifications.action.viewStaged": "View staged",
    "notifications.action.openJob": "Open job",
    "notifications.action.viewStaging": "Go to staging",
    "notifications.action.openModules": "Open module settings",
    "notifications.action.openAutomation": "Open automation",
    "notifications.action.openApiKeys": "Manage API keys",
    "notifications.action.viewSettings": "View settings",
    "notifications.action.dismiss": "Dismiss",

    // Group headers (time buckets)
    "notifications.group.today": "Today",
    "notifications.group.yesterday": "Yesterday",
    "notifications.group.thisWeek": "This week",
    "notifications.group.earlier": "Earlier",
    "notifications.group.unreadCount": "{count} unread",

    // Generic actor labels — Sprint 4 L-A removed `notifications.actor.
    // enrichment` alongside the dead `NotificationActorType = "enrichment"`
    // variant. When enrichment failure notifications land, the introducing
    // sprint re-adds both in the same change.
    "notifications.actor.system": "System",
    "notifications.actor.module": "Module",
    "notifications.actor.automation": "Automation",
    "notifications.actor.user": "You",

    // L-Y-03 — sr-only word for the unread-dot indicator. Previously
    // hardcoded as a bullet glyph, which AT reads as "bullet"/"black
    // circle" instead of the semantic state.
    "notifications.unreadIndicator": "Unread",
  },
  de: {
    "notifications.title": "Benachrichtigungen",
    "notifications.markAllRead": "Alle als gelesen markieren",
    "notifications.noNotifications": "Keine Benachrichtigungen",
    "notifications.vacancyPromoted": "Job aus bereitgestelltem Stellenangebot erstellt",
    "notifications.bulkActionCompleted": "{succeeded} Elemente erfolgreich {actionType}",
    "notifications.retentionCompleted": "{count} abgelaufene Stellenangebote bereinigt",
    "notifications.moduleDeactivated": "Modul {name} deaktiviert. {automationCount} Automatisierung(en) pausiert.",
    "notifications.moduleReactivated": "Modul {name} reaktiviert. {automationCount} Automatisierung(en) bleiben pausiert.",
    "notifications.moduleUnreachable": "Modul {name} ist nicht erreichbar. {automationCount} Automatisierung(en) pausiert.",
    "notifications.cbEscalation": "Circuit-Breaker ausgelöst für Modul {name}. {automationCount} Automatisierung(en) pausiert.",
    "notifications.consecutiveFailures": "Modul {name} ist {failureCount} Mal hintereinander fehlgeschlagen. {automationCount} Automatisierung(en) pausiert.",
    "notifications.authFailure": "Authentifizierung fehlgeschlagen für Modul {name}. {automationCount} Automatisierung(en) pausiert.",
    "notifications.batchStaged": "{count} neue Stellenangebote aus \"{name}\"",
    "notifications.jobStatusChanged": "Job-Status geändert zu {newStatus}",
    "notifications.dismiss": "Verwerfen",
    "notifications.viewJob": "Job ansehen",
    "notifications.viewAutomation": "Automatisierung ansehen",

    // 5W+H rework — parametric titles
    "notifications.moduleDeactivated.title": "Modul pausiert: {moduleName}",
    "notifications.moduleReactivated.title": "Modul reaktiviert: {moduleName}",
    "notifications.moduleUnreachable.title": "Modul nicht erreichbar: {moduleName}",
    "notifications.cbEscalation.title": "Circuit-Breaker ausgelöst",
    "notifications.consecutiveFailures.title": "{count} aufeinanderfolgende Fehler",
    "notifications.authFailure.title": "Authentifizierung fehlgeschlagen",
    "notifications.vacancyPromoted.title": "Neuer Job hinzugefügt",
    "notifications.vacancyBatchStaged.title": "{count} neue Stellenangebote aus {automationName}",
    "notifications.bulkActionCompleted.title": "{action}: {count} Elemente",
    "notifications.retentionCompleted.title": "Datenaufbewahrung abgeschlossen",
    "notifications.jobStatusChanged.title": "Job-Status: {status}",
    "notifications.webhook.deliveryFailed.title": "Webhook-Zustellung fehlgeschlagen",
    "notifications.webhook.endpointDeactivated.title": "Webhook-Endpunkt deaktiviert",

    // Reason / context strings
    "notifications.reason.moduleTimeout": "Modul hat nicht innerhalb des konfigurierten Zeitlimits geantwortet",
    "notifications.reason.authExpired": "API-Schlüssel ungültig oder abgelaufen",
    "notifications.reason.circuitBreaker": "Zu viele Fehler, Circuit-Breaker geöffnet",
    "notifications.reason.manualDeactivation": "Vom Benutzer deaktiviert",

    // Action button labels
    "notifications.action.viewStaged": "Vorbereitete anzeigen",
    "notifications.action.openJob": "Job öffnen",
    "notifications.action.viewStaging": "Zur Vorbereitung",
    "notifications.action.openModules": "Moduleinstellungen öffnen",
    "notifications.action.openAutomation": "Automatisierung öffnen",
    "notifications.action.openApiKeys": "API-Schlüssel verwalten",
    "notifications.action.viewSettings": "Einstellungen anzeigen",
    "notifications.action.dismiss": "Verwerfen",

    // Group headers
    "notifications.group.today": "Heute",
    "notifications.group.yesterday": "Gestern",
    "notifications.group.thisWeek": "Diese Woche",
    "notifications.group.earlier": "Früher",
    "notifications.group.unreadCount": "{count} ungelesen",

    // Generic actor labels — Sprint 4 L-A removed `notifications.actor.
    // enrichment` alongside the dead `NotificationActorType = "enrichment"`
    // variant.
    "notifications.actor.system": "System",
    "notifications.actor.module": "Modul",
    "notifications.actor.automation": "Automatisierung",
    "notifications.actor.user": "Sie",

    // L-Y-03 — sr-only word for the unread-dot indicator.
    "notifications.unreadIndicator": "Ungelesen",
  },
  fr: {
    "notifications.title": "Notifications",
    "notifications.markAllRead": "Tout marquer comme lu",
    "notifications.noNotifications": "Aucune notification",
    "notifications.vacancyPromoted": "Emploi cr\u00e9\u00e9 \u00e0 partir d'une offre mise en attente",
    "notifications.bulkActionCompleted": "{succeeded} \u00e9l\u00e9ments {actionType} avec succ\u00e8s",
    "notifications.retentionCompleted": "{count} offres expir\u00e9es nettoy\u00e9es",
    "notifications.moduleDeactivated": "Module {name} d\u00e9sactiv\u00e9. {automationCount} automatisation(s) en pause.",
    "notifications.moduleReactivated": "Module {name} r\u00e9activ\u00e9. {automationCount} automatisation(s) restent en pause.",
    "notifications.moduleUnreachable": "Module {name} injoignable. {automationCount} automatisation(s) en pause.",
    "notifications.cbEscalation": "Disjoncteur d\u00e9clench\u00e9 pour le module {name}. {automationCount} automatisation(s) en pause.",
    "notifications.consecutiveFailures": "Le module {name} a \u00e9chou\u00e9 {failureCount} fois cons\u00e9cutives. {automationCount} automatisation(s) en pause.",
    "notifications.authFailure": "\u00c9chec d'authentification pour le module {name}. {automationCount} automatisation(s) en pause.",
    "notifications.batchStaged": "{count} nouvelles offres mises en attente depuis \"{name}\"",
    "notifications.jobStatusChanged": "Statut de l'emploi changé en {newStatus}",
    "notifications.dismiss": "Ignorer",
    "notifications.viewJob": "Voir l'emploi",
    "notifications.viewAutomation": "Voir l'automatisation",

    // 5W+H rework — parametric titles
    "notifications.moduleDeactivated.title": "Module en pause : {moduleName}",
    "notifications.moduleReactivated.title": "Module réactivé : {moduleName}",
    "notifications.moduleUnreachable.title": "Module injoignable : {moduleName}",
    "notifications.cbEscalation.title": "Disjoncteur déclenché",
    "notifications.consecutiveFailures.title": "{count} échecs consécutifs",
    "notifications.authFailure.title": "Échec d'authentification",
    "notifications.vacancyPromoted.title": "Nouvel emploi ajouté",
    "notifications.vacancyBatchStaged.title": "{count} nouvelles offres de {automationName}",
    "notifications.bulkActionCompleted.title": "{action} : {count} éléments",
    "notifications.retentionCompleted.title": "Rétention des données terminée",
    "notifications.jobStatusChanged.title": "Statut de l'emploi : {status}",
    "notifications.webhook.deliveryFailed.title": "Échec de la livraison du webhook",
    "notifications.webhook.endpointDeactivated.title": "Point de terminaison webhook désactivé",

    // Reason / context strings
    "notifications.reason.moduleTimeout": "Le module n'a pas répondu dans le délai configuré",
    "notifications.reason.authExpired": "Clé API invalide ou expirée",
    "notifications.reason.circuitBreaker": "Trop d'échecs, disjoncteur ouvert",
    "notifications.reason.manualDeactivation": "Désactivé par l'utilisateur",

    // Action button labels
    "notifications.action.viewStaged": "Voir la file d'attente",
    "notifications.action.openJob": "Ouvrir l'emploi",
    "notifications.action.viewStaging": "Aller à la file d'attente",
    "notifications.action.openModules": "Ouvrir les modules",
    "notifications.action.openAutomation": "Ouvrir l'automatisation",
    "notifications.action.openApiKeys": "Gérer les clés API",
    "notifications.action.viewSettings": "Voir les paramètres",
    "notifications.action.dismiss": "Ignorer",

    // Group headers
    "notifications.group.today": "Aujourd'hui",
    "notifications.group.yesterday": "Hier",
    "notifications.group.thisWeek": "Cette semaine",
    "notifications.group.earlier": "Plus ancien",
    "notifications.group.unreadCount": "{count} non lu(s)",

    // Generic actor labels — Sprint 4 L-A removed `notifications.actor.
    // enrichment` alongside the dead `NotificationActorType = "enrichment"`
    // variant.
    "notifications.actor.system": "Système",
    "notifications.actor.module": "Module",
    "notifications.actor.automation": "Automatisation",
    "notifications.actor.user": "Vous",

    // L-Y-03 — sr-only word for the unread-dot indicator.
    "notifications.unreadIndicator": "Non lu",
  },
  es: {
    "notifications.title": "Notificaciones",
    "notifications.markAllRead": "Marcar todo como le\u00eddo",
    "notifications.noNotifications": "Sin notificaciones",
    "notifications.vacancyPromoted": "Empleo creado a partir de vacante preparada",
    "notifications.bulkActionCompleted": "{succeeded} elementos {actionType} exitosamente",
    "notifications.retentionCompleted": "{count} vacantes expiradas limpiadas",
    "notifications.moduleDeactivated": "M\u00f3dulo {name} desactivado. {automationCount} automatizaci\u00f3n(es) en pausa.",
    "notifications.moduleReactivated": "M\u00f3dulo {name} reactivado. {automationCount} automatizaci\u00f3n(es) siguen en pausa.",
    "notifications.moduleUnreachable": "M\u00f3dulo {name} inalcanzable. {automationCount} automatizaci\u00f3n(es) en pausa.",
    "notifications.cbEscalation": "Disyuntor activado para el m\u00f3dulo {name}. {automationCount} automatizaci\u00f3n(es) en pausa.",
    "notifications.consecutiveFailures": "El m\u00f3dulo {name} fall\u00f3 {failureCount} veces consecutivas. {automationCount} automatizaci\u00f3n(es) en pausa.",
    "notifications.authFailure": "Error de autenticaci\u00f3n para el m\u00f3dulo {name}. {automationCount} automatizaci\u00f3n(es) en pausa.",
    "notifications.batchStaged": "{count} nuevas vacantes preparadas desde \"{name}\"",
    "notifications.jobStatusChanged": "Estado del empleo cambiado a {newStatus}",
    "notifications.dismiss": "Descartar",
    "notifications.viewJob": "Ver empleo",
    "notifications.viewAutomation": "Ver automatización",

    // 5W+H rework — parametric titles
    "notifications.moduleDeactivated.title": "Módulo en pausa: {moduleName}",
    "notifications.moduleReactivated.title": "Módulo reactivado: {moduleName}",
    "notifications.moduleUnreachable.title": "Módulo inalcanzable: {moduleName}",
    "notifications.cbEscalation.title": "Disyuntor activado",
    "notifications.consecutiveFailures.title": "{count} fallos consecutivos",
    "notifications.authFailure.title": "Error de autenticación",
    "notifications.vacancyPromoted.title": "Nuevo empleo añadido",
    "notifications.vacancyBatchStaged.title": "{count} nuevas vacantes de {automationName}",
    "notifications.bulkActionCompleted.title": "{action}: {count} elementos",
    "notifications.retentionCompleted.title": "Retención de datos completada",
    "notifications.jobStatusChanged.title": "Estado del empleo: {status}",
    "notifications.webhook.deliveryFailed.title": "Fallo en la entrega del webhook",
    "notifications.webhook.endpointDeactivated.title": "Punto de conexión webhook desactivado",

    // Reason / context strings
    "notifications.reason.moduleTimeout": "El módulo no respondió dentro del tiempo configurado",
    "notifications.reason.authExpired": "Clave API inválida o expirada",
    "notifications.reason.circuitBreaker": "Demasiados fallos, disyuntor abierto",
    "notifications.reason.manualDeactivation": "Desactivado por el usuario",

    // Action button labels
    "notifications.action.viewStaged": "Ver preparadas",
    "notifications.action.openJob": "Abrir empleo",
    "notifications.action.viewStaging": "Ir a preparación",
    "notifications.action.openModules": "Abrir módulos",
    "notifications.action.openAutomation": "Abrir automatización",
    "notifications.action.openApiKeys": "Gestionar claves API",
    "notifications.action.viewSettings": "Ver configuración",
    "notifications.action.dismiss": "Descartar",

    // Group headers
    "notifications.group.today": "Hoy",
    "notifications.group.yesterday": "Ayer",
    "notifications.group.thisWeek": "Esta semana",
    "notifications.group.earlier": "Anterior",
    "notifications.group.unreadCount": "{count} sin leer",

    // Generic actor labels — Sprint 4 L-A removed `notifications.actor.
    // enrichment` alongside the dead `NotificationActorType = "enrichment"`
    // variant.
    "notifications.actor.system": "Sistema",
    "notifications.actor.module": "Módulo",
    "notifications.actor.automation": "Automatización",
    "notifications.actor.user": "Tú",

    // L-Y-03 — sr-only word for the unread-dot indicator.
    "notifications.unreadIndicator": "No leído",
  },
} as const;
