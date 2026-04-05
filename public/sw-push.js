/**
 * Push-only Service Worker for JobSync browser push notifications.
 *
 * This is NOT a full PWA service worker — it only handles push events
 * and notification click navigation. No caching, no offline support.
 */

/* eslint-disable no-restricted-globals */

self.addEventListener("push", function (event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "JobSync";
  const options = {
    body: data.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { url: data.url || "/dashboard" },
    tag: data.tag || "jobsync-notification",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(clients.openWindow(url));
});
