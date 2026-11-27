const CACHE = 'codm-digital-v10';
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

async function addStaffShortcut(response) {
  if (!response || !response.ok) return response;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.clone().text();

  // Avoid adding the shortcut more than once.
  if (html.includes('id="codm-staff-shortcut"')) return response;

  const shortcut = `
    <a id="codm-staff-shortcut"
       href="./staff.html"
       aria-label="الطاقم الفني"
       style="
         position:fixed;
         left:18px;
         bottom:18px;
         z-index:2147483000;
         display:inline-flex;
         align-items:center;
         justify-content:center;
         padding:13px 19px;
         border:2px solid #c8a45d;
         border-radius:12px;
         background:#8d1520;
         color:#fff;
         font-family:Tahoma,Arial,sans-serif;
         font-size:15px;
         font-weight:700;
         text-decoration:none;
         box-shadow:0 5px 18px rgba(0,0,0,.25);
       ">الطاقم الفني</a>
  `;

  if (/<\\/body\\s*>/i.test(html)) {
    html = html.replace(/<\\/body\\s*>/i, shortcut + '</body>');
  } else {
    html += shortcut;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

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

        if (response.ok && response.type === 'basic') {
          await cache.put(request, response.clone());
        }

        return await addStaffShortcut(response);
      } catch {
        if (!cached) return Response.error();
        return await addStaffShortcut(cached);
      }
    })
  );
});
