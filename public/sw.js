const CACHE = 'zentrid-mobile-shell-v1.0.2';
const STATIC = ['/index.html','/login.html','/assets/css/mobile.css','/assets/js/api-client.js','/assets/js/mobile-api.js','/assets/js/auth-guard.js','/assets/js/app.js','/assets/js/login.js','/assets/icons/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(request, copy));
    return response;
  }).catch(() => caches.match(request).then(response => response || caches.match('/index.html'))));
});
