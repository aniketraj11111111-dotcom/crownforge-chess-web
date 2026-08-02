const CACHE = "crownforge-v31-unlimited-history";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=31",
  "./last-move.css?v=31",
  "./turn-guidance.css?v=31",
  "./premium-phase1.css?v=31",
  "./webgl-phase2.css?v=31",
  "./cinematic-endgame.css?v=31",
  "./history-controls.css?v=31",
  "./board-geometry-lock.css?v=31",
  "./production-board.css?v=31",
  "./touch-feedback.css?v=31",
  "./offline-status.css?v=31",
  "./install-control.css?v=31",
  "./fullscreen-control.css?v=31",
  "./premium-soundtrack.css?v=31",
  "./src/app-stable.js?v=31",
  "./src/session-state.js",
  "./src/board3d.js?v=31",
  "./src/board3d-meshes.js?v=31",
  "./src/engine-stable.js",
  "./src/feedback.js?v=31",
  "./src/terminal-focus.js?v=31",
  "./src/keyboard-nav.js?v=31",
  "./src/promotion-focus.js?v=31",
  "./src/board-semantics.js?v=31",
  "./src/touch-feedback.js?v=31",
  "./src/screen-wake.js?v=31",
  "./src/connectivity-status.js?v=31",
  "./src/fullscreen-control.js?v=31",
  "./src/install-control.js?v=31",
  "./src/cinematic-director.js?v=31",
  "./src/premium-soundtrack.js?v=31",
  "./manifest.webmanifest?v=31",
  "./public/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
