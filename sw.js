const CACHE = 'codm-digital-v14';
const BASE = new URL(self.registration.scope);
const STAFF_SCRIPT = new URL('./staff-dashboard.js?v=14', BASE).href;

const MAIN_PATHS = new Set([
  new URL('./', BASE).pathname,
  new URL('./index.html', BASE).pathname
]);

// Small, reusable same-origin files are cached during installation.
// HTML pages are safe to cache because their live data still comes from Supabase.
const FILES = [
  new URL('./manifest.json', BASE).href,
  new URL('./assets/codm-logo.jpg', BASE).href,
  new URL('./staff-dashboard.js?v=14', BASE).href,
  new URL('./staff.html', BASE).href,
  new URL('./boxer-card.html', BASE).href,
  new URL('./reset-password.html', BASE).href
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
  event.waitUntil((async () => {
    // Start navigation requests before the service worker finishes waking up.
    try {
      await self.registration.navigationPreload.enable();
    } catch (_) {}

    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith('codm-digital-') && key !== CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
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
        // Navigation preload overlaps the network request with service-worker startup.
        const preloaded = await event.preloadResponse;
        const response = preloaded || await fetch(new Request(request, { cache: 'no-store' }));
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
            if (/staff-dashboard\.js(?:\?|["'])/i.test(probe)) scriptFound = true;
            tail = probe.slice(-160);
            controller.enqueue(encoder.encode(text));
          },
          flush(controller) {
            const finalText = decoder.decode();
            if (finalText) {
              const probe = tail + finalText;
              if (/staff-dashboard\.js(?:\?|["'])/i.test(probe)) scriptFound = true;
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

      // Serve cached pages immediately, while refreshing them in the background.
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then(response => {
              if (response.ok && response.type === 'basic') {
                return cache.put(request, response.clone());
              }
            })
            .catch(() => {})
        );
        return cached;
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