const CACHE = "crownforge-v29-side-lock";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=29",
  "./last-move.css?v=29",
  "./turn-guidance.css?v=29",
  "./premium-phase1.css?v=29",
  "./webgl-phase2.css?v=29",
  "./cinematic-endgame.css?v=29",
  "./board-geometry-lock.css?v=29",
  "./production-board.css?v=29",
  "./touch-feedback.css?v=29",
  "./offline-status.css?v=29",
  "./install-control.css?v=29",
  "./fullscreen-control.css?v=29",
  "./src/app-stable.js?v=29",
  "./src/session-state.js",
  "./src/board3d.js?v=29",
  "./src/board3d-meshes.js",
  "./src/engine-stable.js",
  "./src/feedback.js?v=29",
  "./src/terminal-focus.js?v=29",
  "./src/keyboard-nav.js?v=29",
  "./src/promotion-focus.js?v=29",
  "./src/board-semantics.js?v=29",
  "./src/touch-feedback.js?v=29",
  "./src/screen-wake.js?v=29",
  "./src/connectivity-status.js?v=29",
  "./src/fullscreen-control.js?v=29",
  "./src/install-control.js?v=29",
  "./src/cinematic-director.js?v=29",
  "./manifest.webmanifest?v=29",
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
