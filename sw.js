// Cache First para /data/**/p*.txt
const CACHE = 'meujus-v1';
const isProof = url => /\/data\/.+\/p\d+(\.\w+)?\.txt(\?.*)?$/.test(url);

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE)));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  if (!isProof(request.url)) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;                      // Cache First
    const resp = await fetch(request, { cache:'reload' });
    if (resp.ok) cache.put(request, resp.clone());
    return resp;
  })());
});
