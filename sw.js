// sw.js — cache leve, só no mesmo domínio
const CACHE = "meujus-static-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./favicon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // não intercepta externas
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
