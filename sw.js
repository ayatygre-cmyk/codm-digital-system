const CACHE = 'codm-digital-v13';
const BASE = new URL(self.registration.scope);
const STAFF_SCRIPT = new URL('./staff-dashboard.js?v=13', BASE).href;

const MAIN_PATHS = new Set([
  new URL('./', BASE).pathname,
  new URL('./index.html', BASE).pathname
]);

// Cache only small, reusable static assets. The large homepage is streamed
// directly from the network so the browser can render it while it downloads.
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
      if (isMainPage) {
        const response = await fetch(new Request(request, { cache: 'no-store' }));
        if (!response.ok || response.type !== 'basic' || !response.body) return response;

        const headers = new Headers(response.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let tail = '';
        let scriptFound = false;
        const scriptTag = '<script src="' + STAFF_SCRIPT + '" defer><' + '/script>';

        const stream = response.body.pipeThrough(new TransformStream({
          transform(chunk, controller) {
            const text = decoder.decode(chunk, { stream: true });
            const probe = tail + text;
            if (/staff-dashboard\\.js(?:\\?|["'])/i.test(probe)) scriptFound = true;
            tail = probe.slice(-160);
            controller.enqueue(encoder.encode(text));
          },
          flush(controller) {
            const finalText = decoder.decode();
            if (finalText) {
              const probe = tail + finalText;
              if (/staff-dashboard\\.js(?:\\?|["'])/i.test(probe)) scriptFound = true;
              controller.enqueue(encoder.encode(finalText));
            }
            if (!scriptFound) controller.enqueue(encoder.encode(scriptTag));
          }
        }));

        return new Response(stream, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }

      const response = await fetch(request);
      if (!response.ok || response.type !== 'basic') return response;
      await cache.put(request, response.clone());
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});
