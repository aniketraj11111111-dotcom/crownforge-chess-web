const CACHE = "crownforge-v19-board-semantics";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=19",
  "./last-move.css?v=19",
  "./turn-guidance.css?v=19",
  "./premium-phase1.css?v=19",
  "./webgl-phase2.css?v=19",
  "./cinematic-endgame.css?v=19",
  "./board-geometry-lock.css?v=19",
  "./src/app-stable.js?v=19",
  "./src/board3d.js?v=19",
  "./src/board3d-meshes.js",
  "./src/engine-stable.js",
  "./src/feedback.js?v=19",
  "./src/terminal-focus.js?v=19",
  "./src/keyboard-nav.js?v=19",
  "./src/promotion-focus.js?v=19",
  "./src/board-semantics.js?v=19",
  "./manifest.webmanifest?v=19",
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
