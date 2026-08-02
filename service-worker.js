const CACHE = "crownforge-v33-sonic-forge";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=33",
  "./last-move.css?v=33",
  "./turn-guidance.css?v=33",
  "./premium-phase1.css?v=33",
  "./webgl-phase2.css?v=33",
  "./cinematic-endgame.css?v=33",
  "./history-controls.css?v=33",
  "./board-geometry-lock.css?v=33",
  "./production-board.css?v=33",
  "./touch-feedback.css?v=33",
  "./offline-status.css?v=33",
  "./install-control.css?v=33",
  "./fullscreen-control.css?v=33",
  "./sonic-forge.css?v=33",
  "./src/app-stable.js?v=33",
  "./src/session-state.js",
  "./src/board3d.js?v=33",
  "./src/board3d-meshes.js?v=33",
  "./src/board3d-materials.js?v=33",
  "./src/engine-stable.js",
  "./src/feedback.js?v=33",
  "./src/terminal-focus.js?v=33",
  "./src/keyboard-nav.js?v=33",
  "./src/promotion-focus.js?v=33",
  "./src/board-semantics.js?v=33",
  "./src/touch-feedback.js?v=33",
  "./src/screen-wake.js?v=33",
  "./src/connectivity-status.js?v=33",
  "./src/fullscreen-control.js?v=33",
  "./src/install-control.js?v=33",
  "./src/cinematic-director.js?v=33",
  "./src/sonic-forge.js?v=33",
  "./public/audio/crownforge-sonic-forge-v33.wav",
  "./public/audio/crownforge-sonic-forge-v33.json",
  "./manifest.webmanifest?v=33",
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
