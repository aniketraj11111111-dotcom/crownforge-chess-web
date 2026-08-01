const CACHE = "crownforge-v18-promotion-focus";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=18",
  "./last-move.css?v=18",
  "./turn-guidance.css?v=18",
  "./premium-phase1.css?v=18",
  "./webgl-phase2.css?v=18",
  "./cinematic-endgame.css?v=18",
  "./board-geometry-lock.css?v=18",
  "./src/app-stable.js?v=18",
  "./src/board3d.js?v=18",
  "./src/board3d-meshes.js",
  "./src/engine-stable.js",
  "./src/feedback.js?v=18",
  "./src/terminal-focus.js?v=18",
  "./src/keyboard-nav.js?v=18",
  "./src/promotion-focus.js?v=18",
  "./manifest.webmanifest?v=18",
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
