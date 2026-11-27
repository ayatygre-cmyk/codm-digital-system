const CACHE = 'codm-digital-v15';
const BASE = new URL(self.registration.scope);
const STAFF_SCRIPT = new URL('./staff-dashboard.js?v=15', BASE).href;

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

  if (!isMainPage) {
    const cacheKey = url.pathname.endsWith('/staff-dashboard.js')
      ? request
      : new Request(url.origin + url.pathname, { method: 'GET' });
    const cachePromise = caches.open(CACHE);
    const cachedPromise = cachePromise.then(cache => cache.match(cacheKey));
    const refreshPromise = cachePromise.then(cache =>
      fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          // Store HTML under its clean path, never under a URL that may contain auth tokens.
          return cache.put(cacheKey, response.clone()).then(() => response);
        }
        return response;
      })
    );

    // Extend the fetch event while the cached page is refreshed in the background.
    event.waitUntil(refreshPromise.then(() => undefined).catch(() => undefined));
    event.respondWith((async () => {
      const cached = await cachedPromise;
      if (cached) return cached;
      try {
        return await refreshPromise;
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      // Navigation preload overlaps the request with service-worker startup.
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
    } catch (_) {
      return Response.error();
    }
  })());
});
