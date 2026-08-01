const CACHE = "crownforge-v23-install-control";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=23",
  "./last-move.css?v=23",
  "./turn-guidance.css?v=23",
  "./premium-phase1.css?v=23",
  "./webgl-phase2.css?v=23",
  "./cinematic-endgame.css?v=23",
  "./board-geometry-lock.css?v=23",
  "./touch-feedback.css?v=23",
  "./offline-status.css?v=23",
  "./install-control.css?v=23",
  "./src/app-stable.js?v=23",
  "./src/board3d.js?v=23",
  "./src/board3d-meshes.js",
  "./src/engine-stable.js",
  "./src/feedback.js?v=23",
  "./src/terminal-focus.js?v=23",
  "./src/keyboard-nav.js?v=23",
  "./src/promotion-focus.js?v=23",
  "./src/board-semantics.js?v=23",
  "./src/touch-feedback.js?v=23",
  "./src/screen-wake.js?v=23",
  "./src/connectivity-status.js?v=23",
  "./src/install-control.js?v=23",
  "./manifest.webmanifest?v=23",
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
