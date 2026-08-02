const CACHE = "crownforge-v32-premium-ebony-board";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=32",
  "./last-move.css?v=32",
  "./turn-guidance.css?v=32",
  "./premium-phase1.css?v=32",
  "./webgl-phase2.css?v=32",
  "./cinematic-endgame.css?v=32",
  "./history-controls.css?v=32",
  "./board-geometry-lock.css?v=32",
  "./production-board.css?v=32",
  "./touch-feedback.css?v=32",
  "./offline-status.css?v=32",
  "./install-control.css?v=32",
  "./fullscreen-control.css?v=32",
  "./premium-soundtrack.css?v=32",
  "./src/app-stable.js?v=32",
  "./src/session-state.js",
  "./src/board3d.js?v=32",
  "./src/board3d-meshes.js?v=32",
  "./src/board3d-materials.js?v=32",
  "./src/engine-stable.js",
  "./src/feedback.js?v=32",
  "./src/terminal-focus.js?v=32",
  "./src/keyboard-nav.js?v=32",
  "./src/promotion-focus.js?v=32",
  "./src/board-semantics.js?v=32",
  "./src/touch-feedback.js?v=32",
  "./src/screen-wake.js?v=32",
  "./src/connectivity-status.js?v=32",
  "./src/fullscreen-control.js?v=32",
  "./src/install-control.js?v=32",
  "./src/cinematic-director.js?v=32",
  "./src/premium-soundtrack.js?v=32",
  "./manifest.webmanifest?v=32",
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
