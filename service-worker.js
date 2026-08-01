const CACHE = "crownforge-v25-premium-board";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=25",
  "./last-move.css?v=25",
  "./turn-guidance.css?v=25",
  "./premium-phase1.css?v=25",
  "./webgl-phase2.css?v=25",
  "./cinematic-endgame.css?v=25",
  "./board-geometry-lock.css?v=25",
  "./touch-feedback.css?v=25",
  "./offline-status.css?v=25",
  "./install-control.css?v=25",
  "./fullscreen-control.css?v=25",
  "./src/app-stable.js?v=25",
  "./src/board3d.js?v=25",
  "./src/board3d-meshes.js",
  "./src/feedback.js?v=25",
  "./src/terminal-focus.js?v=25",
  "./src/keyboard-nav.js?v=25",
  "./src/promotion-focus.js?v=25",
  "./src/board-semantics.js?v=25",
  "./src/touch-feedback.js?v=25",
  "./src/screen-wake.js?v=25",
  "./src/connectivity-status.js?v=25",
  "./src/fullscreen-control.js?v=25",
  "./src/install-control.js?v=25",
  "./manifest.webmanifest?v=25",
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
