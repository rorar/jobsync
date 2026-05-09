/**
 * i18n dictionary for Browser Push Notification Channel.
 * Namespace: "push"
 *
 * Contains:
 * - Push notification test and subscription messages
 * - VAPID key management messages
 * - Push error messages
 */
export const push = {
  en: {
    "push.testTitle": "Test Push Notification",
    "push.testBody": "Your push notifications are working correctly.",
    "push.testRateLimited": "Please wait 60 seconds between test pushes.",
    "push.testFailed": "Test push notification failed",
    "push.testSuccess": "Test push notification sent successfully",
    "push.noSubscriptions": "No push subscriptions found. Enable push notifications in your browser first.",
    "push.tooManySubscriptions": "Maximum number of push subscriptions reached",
    "push.invalidEndpoint": "Invalid push subscription endpoint",
    "push.invalidKeys": "Invalid push subscription keys",
    "push.errorSubscribing": "Failed to subscribe to push notifications",
    "push.errorUnsubscribing": "Failed to unsubscribe from push notifications",
    "push.errorFetchingKey": "Failed to fetch VAPID public key",
    "push.errorFetchingCount": "Failed to fetch subscription count",
    "push.errorRotatingKeys": "Failed to rotate VAPID keys",
    "push.keysRotated": "VAPID keys rotated. All existing subscriptions have been removed.",
  },
  de: {
    "push.testTitle": "Test-Push-Benachrichtigung",
    "push.testBody": "Deine Push-Benachrichtigungen funktionieren korrekt.",
    "push.testRateLimited": "Bitte warte 60 Sekunden zwischen Test-Push-Benachrichtigungen.",
    "push.testFailed": "Test-Push-Benachrichtigung fehlgeschlagen",
    "push.testSuccess": "Test-Push-Benachrichtigung erfolgreich gesendet",
    "push.noSubscriptions": "Keine Push-Abonnements gefunden. Aktiviere zuerst Push-Benachrichtigungen in deinem Browser.",
    "push.tooManySubscriptions": "Maximale Anzahl an Push-Abonnements erreicht",
    "push.invalidEndpoint": "Ung\u00fcltiger Push-Abonnement-Endpunkt",
    "push.invalidKeys": "Ung\u00fcltige Push-Abonnement-Schl\u00fcssel",
    "push.errorSubscribing": "Push-Benachrichtigungen konnten nicht abonniert werden",
    "push.errorUnsubscribing": "Push-Benachrichtigungen konnten nicht abbestellt werden",
    "push.errorFetchingKey": "VAPID-Schl\u00fcssel konnte nicht abgerufen werden",
    "push.errorFetchingCount": "Abonnementanzahl konnte nicht abgerufen werden",
    "push.errorRotatingKeys": "VAPID-Schl\u00fcssel konnten nicht rotiert werden",
    "push.keysRotated": "VAPID-Schl\u00fcssel rotiert. Alle bestehenden Abonnements wurden entfernt.",
  },
  fr: {
    "push.testTitle": "Notification push de test",
    "push.testBody": "Vos notifications push fonctionnent correctement.",
    "push.testRateLimited": "Veuillez attendre 60 secondes entre les notifications push de test.",
    "push.testFailed": "\u00c9chec de la notification push de test",
    "push.testSuccess": "Notification push de test envoy\u00e9e avec succ\u00e8s",
    "push.noSubscriptions": "Aucun abonnement push trouv\u00e9. Activez d'abord les notifications push dans votre navigateur.",
    "push.tooManySubscriptions": "Nombre maximum d'abonnements push atteint",
    "push.invalidEndpoint": "Point de terminaison d'abonnement push invalide",
    "push.invalidKeys": "Cl\u00e9s d'abonnement push invalides",
    "push.errorSubscribing": "\u00c9chec de l'abonnement aux notifications push",
    "push.errorUnsubscribing": "\u00c9chec du d\u00e9sabonnement des notifications push",
    "push.errorFetchingKey": "\u00c9chec de la r\u00e9cup\u00e9ration de la cl\u00e9 VAPID",
    "push.errorFetchingCount": "\u00c9chec de la r\u00e9cup\u00e9ration du nombre d'abonnements",
    "push.errorRotatingKeys": "\u00c9chec de la rotation des cl\u00e9s VAPID",
    "push.keysRotated": "Cl\u00e9s VAPID renouvel\u00e9es. Tous les abonnements existants ont \u00e9t\u00e9 supprim\u00e9s.",
  },
  es: {
    "push.testTitle": "Notificaci\u00f3n push de prueba",
    "push.testBody": "Tus notificaciones push funcionan correctamente.",
    "push.testRateLimited": "Por favor, espera 60 segundos entre notificaciones push de prueba.",
    "push.testFailed": "Error en la notificaci\u00f3n push de prueba",
    "push.testSuccess": "Notificaci\u00f3n push de prueba enviada con \u00e9xito",
    "push.noSubscriptions": "No se encontraron suscripciones push. Activa primero las notificaciones push en tu navegador.",
    "push.tooManySubscriptions": "N\u00famero m\u00e1ximo de suscripciones push alcanzado",
    "push.invalidEndpoint": "Punto de conexi\u00f3n de suscripci\u00f3n push inv\u00e1lido",
    "push.invalidKeys": "Claves de suscripci\u00f3n push inv\u00e1lidas",
    "push.errorSubscribing": "No se pudo suscribir a las notificaciones push",
    "push.errorUnsubscribing": "No se pudo cancelar la suscripci\u00f3n a las notificaciones push",
    "push.errorFetchingKey": "No se pudo obtener la clave VAPID",
    "push.errorFetchingCount": "No se pudo obtener el n\u00famero de suscripciones",
    "push.errorRotatingKeys": "No se pudieron rotar las claves VAPID",
    "push.keysRotated": "Claves VAPID rotadas. Todas las suscripciones existentes han sido eliminadas.",
  },
} as const;
