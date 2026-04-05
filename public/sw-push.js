/**
 * Push-only Service Worker for JobSync browser push notifications.
 *
 * This is NOT a full PWA service worker — it only handles push events
 * and notification click navigation. No caching, no offline support.
 */

/* eslint-disable no-restricted-globals */

self.addEventListener("push", function (event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      // Fallback: treat payload as plain text if JSON parsing fails
      data = { body: event.data.text() };
    }
  }
  var title = data.title || "JobSync";
  var options = {
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
  var raw = event.notification.data?.url || "/dashboard";
  // Security: only allow relative paths (same-origin navigation).
  // Block absolute URLs, protocol-relative URLs, and javascript: URIs
  // to prevent a malicious push payload from navigating to a phishing site.
  var url = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  event.waitUntil(clients.openWindow(url));
});
