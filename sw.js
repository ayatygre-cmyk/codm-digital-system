const CACHE = 'codm-digital-v8';

const BASE = new URL(self.registration.scope);

const FILES = [
  new URL('./', BASE).href,
  new URL('./index.html', BASE).href,
  new URL('./manifest.json', BASE).href,
  new URL('./assets/codm-logo.jpg', BASE).href
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
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // عدم تخزين أي طلب خارجي، بما فيه Supabase
  if (url.origin !== BASE.origin) return;

  // تخزين الملفات الثابتة المحددة فقط
  if (!STATIC_PATHS.has(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);

      try {
        const response = await fetch(request);

        if (response.ok && response.type === 'basic') {
          await cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        return cached || Response.error();
      }
    })
  );
});
