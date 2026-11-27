const CACHE = 'codm-digital-v12';
const BASE = new URL(self.registration.scope);
const STAFF_SCRIPT = new URL('./staff-dashboard.js?v=12', BASE).href;

const MAIN_PATHS = new Set([
  new URL('./', BASE).pathname,
  new URL('./index.html', BASE).pathname
]);

// Keep the large homepage out of Cache Storage; fetch it fresh and inject
// the small dashboard enhancement without replacing the original HTML.
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
          .filter(key => key.startsWith('codm-digital-') && key !== CACHE)
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

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = isMainPage ? null : await cache.match(request);

    try {
      const networkRequest = isMainPage
        ? new Request(request, { cache: 'no-store' })
        : request;
      const response = await fetch(networkRequest);
      if (!response.ok || response.type !== 'basic') return response;

      if (isMainPage) {
        const html = await response.text();
        const scriptTag = '<script src="' + STAFF_SCRIPT + '" defer><' + '/script>';
        let updatedHtml = html;

        if (!/staff-dashboard\.js(?:\?|["'])/i.test(updatedHtml)) {
          if (/<\/body\s*>/i.test(updatedHtml)) {
            updatedHtml = updatedHtml.replace(/<\/body\s*>/i, scriptTag + '</body>');
          } else {
            updatedHtml += scriptTag;
          }
        }

        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
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
  })());
});