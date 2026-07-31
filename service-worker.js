const CACHE = "crownforge-v11-webgl-phase2a";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=11",
  "./last-move.css?v=11",
  "./turn-guidance.css?v=11",
  "./premium-phase1.css?v=11",
  "./webgl-phase2.css?v=11",
  "./board-geometry-lock.css?v=11",
  "./src/app-stable.js?v=11",
  "./src/board3d.js?v=11",
  "./src/board3d-meshes.js",
  "./src/engine-stable.js",
  "./src/feedback.js?v=11",
  "./manifest.webmanifest?v=11",
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
