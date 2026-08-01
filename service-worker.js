const CACHE = "crownforge-v28-production-board";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=28",
  "./last-move.css?v=28",
  "./turn-guidance.css?v=28",
  "./premium-phase1.css?v=28",
  "./webgl-phase2.css?v=28",
  "./cinematic-endgame.css?v=28",
  "./board-geometry-lock.css?v=28",
  "./production-board.css?v=28",
  "./touch-feedback.css?v=28",
  "./offline-status.css?v=28",
  "./install-control.css?v=28",
  "./fullscreen-control.css?v=28",
  "./src/app-stable.js?v=28",
  "./src/board3d.js?v=28",
  "./src/board3d-meshes.js",
  "./src/feedback.js?v=28",
  "./src/terminal-focus.js?v=28",
  "./src/keyboard-nav.js?v=28",
  "./src/promotion-focus.js?v=28",
  "./src/board-semantics.js?v=28",
  "./src/touch-feedback.js?v=28",
  "./src/screen-wake.js?v=28",
  "./src/connectivity-status.js?v=28",
  "./src/fullscreen-control.js?v=28",
  "./src/install-control.js?v=28",
  "./src/cinematic-director.js?v=28",
  "./manifest.webmanifest?v=28",
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
