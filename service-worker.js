const CACHE = "crownforge-v30-premium-3d";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=30",
  "./last-move.css?v=30",
  "./turn-guidance.css?v=30",
  "./premium-phase1.css?v=30",
  "./webgl-phase2.css?v=30",
  "./cinematic-endgame.css?v=30",
  "./board-geometry-lock.css?v=30",
  "./production-board.css?v=30",
  "./touch-feedback.css?v=30",
  "./offline-status.css?v=30",
  "./install-control.css?v=30",
  "./fullscreen-control.css?v=30",
  "./src/app-stable.js?v=30",
  "./src/session-state.js",
  "./src/board3d.js?v=30",
  "./src/board3d-meshes.js?v=30",
  "./src/engine-stable.js",
  "./src/feedback.js?v=30",
  "./src/terminal-focus.js?v=30",
  "./src/keyboard-nav.js?v=30",
  "./src/promotion-focus.js?v=30",
  "./src/board-semantics.js?v=30",
  "./src/touch-feedback.js?v=30",
  "./src/screen-wake.js?v=30",
  "./src/connectivity-status.js?v=30",
  "./src/fullscreen-control.js?v=30",
  "./src/install-control.js?v=30",
  "./src/cinematic-director.js?v=30",
  "./manifest.webmanifest?v=30",
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
