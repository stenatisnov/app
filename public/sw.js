// Minimal no-op service worker. This app is server-rendered with live data
// (credits, gate/lock state, admin views), so this worker deliberately does
// no caching — it only registers install/activate/fetch handlers so the
// browser considers the site installable (Add to Home Screen /
// beforeinstallprompt) without risking stale data.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty — every request falls through to normal network handling.
});
