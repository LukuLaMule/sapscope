const CACHE = 'sapscope-v2';
const APP_SHELL = ['/', '/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Ne pas intercepter les appels API ni les assets Vite (déjà versionnés par hash)
  if (e.request.url.includes('/api/')) return;
  if (e.request.url.includes('/assets/')) return;

  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request))
      .catch(() => caches.match('/index.html'))
  );
});
