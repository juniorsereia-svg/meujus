const CACHE = 'meujus-v2';
const isProof = url => /\/data\/.+\/p\d+(\.\w+)?\.txt(\?.*)?$/.test(url);

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE)));
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || !isProof(request.url)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;                 // Cache First
    const resp = await fetch(request);
    if (resp.ok) cache.put(request, resp.clone());
    return resp;
  })());
});

// warmup: {type:'warmup', base:'direito-penal/calunia'}
self.addEventListener('message', e => {
  const msg = e.data || {};
  if (msg.type !== 'warmup' || !msg.base) return;
  const count = Math.max(1, Math.min(msg.count || 10, 10));
  e.waitUntil((async () => {
    const cache = await caches.open('meujus-v2');
    const scope = (self.registration.scope || '/');
    const prefix = scope + 'data/' + msg.base.replace(/^\/+|\/+$/g,'') + '/';
    const urls = Array.from({length:count}, (_,i)=> `${prefix}p${i+1}.txt`);
    await Promise.all(urls.map(async u => {
      if (await cache.match(u)) return;
      try { const r = await fetch(u); if (r.ok) await cache.put(u, r.clone()); } catch {}
    }));
  })());
});

