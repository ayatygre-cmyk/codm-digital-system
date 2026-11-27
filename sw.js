const CACHE = 'codm-digital-v10';
const BASE = new URL(self.registration.scope);
const STAFF_SCRIPT = new URL('./staff-dashboard.js', BASE).href;

const FILES = [
  new URL('./', BASE).href,
  new URL('./index.html', BASE).href,
  new URL('./manifest.json', BASE).href,
  new URL('./assets/codm-logo.jpg', BASE).href,
  STAFF_SCRIPT
];

const STATIC_PATHS = new Set(
  FILES.map(file => new URL(file).pathname)
);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key =>
            key.startsWith('codm-digital-') &&
            key !== CACHE
          )
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (
    url.origin !== BASE.origin ||
    !STATIC_PATHS.has(url.pathname)
  ) return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);

      try {
        const response = await fetch(request);

        if (!response.ok || response.type !== 'basic') {
          return response;
        }

        const isMainPage =
          url.pathname === BASE.pathname ||
          url.pathname === new URL('./index.html', BASE).pathname;

        if (isMainPage) {
          const html = await response.text();
          const scriptTag = '<script src="' + STAFF_SCRIPT + '" defer><' + '/script>';
          const updatedHtml = html.includes('staff-dashboard.js')
            ? html
            : html.replace(/<\/body\s*>/i, scriptTag + '</body>');
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.delete('content-encoding');
          const transformed = new Response(updatedHtml, {
            status: response.status,
            statusText: response.statusText,
            headers
          });
          await cache.put(request, transformed.clone());
          return transformed;
        }

        await cache.put(request, response.clone());
        return response;
      } catch {
        return cached || Response.error();
      }
    })
  );
});
