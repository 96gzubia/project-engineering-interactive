const CACHE = 'project-engineering-v3';
// Keep the cache version: existing downloaded lectures must survive this update.
const LEGACY = new URL('./aula_interactiva.html', self.location.href);
const LECTURE_ONE = new URL('./lectures/01-direccion-de-proyectos.html', self.location.href);
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/lectures.json',
  './assets/favicon.svg',
  './assets/app-icon.svg',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png',
  './assets/app-shell.css',
  './scripts/app-shell.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      // Remove previously cached standalone copies, including query variants.
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname === LEGACY.pathname) await cache.delete(request);
      }
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    })
  );
  self.clients.claim();
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('./index.html');
    throw error;
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Resolve old bookmarks even offline, without caching a second lecture payload.
  if (url.pathname === LEGACY.pathname) {
    const target = new URL(LECTURE_ONE);
    target.search = url.search;
    event.respondWith(Response.redirect(target.href, 302));
    return;
  }

  const isDocument = request.mode === 'navigate' || request.destination === 'document';
  const isAppCode = ['script', 'style', 'manifest'].includes(request.destination) || url.pathname.endsWith('/data/lectures.json');

  if (isDocument || isAppCode) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, event));
});
