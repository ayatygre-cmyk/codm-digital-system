const CACHE = 'codm-digital-v11';
const BASE = new URL(self.registration.scope);
const STAFF_SCRIPT = new URL('./staff-dashboard.js', BASE).href;

const MAIN_PATHS = new Set([
  new URL('./', BASE).pathname,
  new URL('./index.html', BASE).pathname
]);

// Keep the large homepage out of Cache Storage so the service worker can
// install reliably; transform each navigation response as it is requested.
const FILES = [
  new URL('./manifest.json', BASE).href,
  new URL('./assets/codm-logo.jpg', BASE).href,
  STAFF_SCRIPT
];

const STATIC_PATHS = new Set([
  ...FILES.map(file => new URL(file).pathname),
  ...MAIN_PATHS
]);

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
  if (url.origin !== BASE.origin || !STATIC_PATHS.has(url.pathname)) return;

  const isMainPage = MAIN_PATHS.has(url.pathname);

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = isMainPage ? null : await cache.match(request);

      try {
        const response = await fetch(request);
        if (!response.ok || response.type !== 'basic') return response;

        if (isMainPage) {
          const html = await response.text();
          const scriptTag = '<script src="' + STAFF_SCRIPT + '" defer><' + '/script>';
          const updatedHtml = html.includes('staff-dashboard.js')
            ? html
            : html.replace(/<\\/body\\s*>/i, scriptTag + '</body>');
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.delete('content-encoding');
          return new Response(updatedHtml, {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        }

        await cache.put(request, response.clone());
        return response;
      } catch {
        return cached || Response.error();
      }
    })
  );
});
