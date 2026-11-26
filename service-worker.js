const CACHE_NAME = 'aqua-remind-desktop-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Selalu ambil jadwal sholat terbaru dari API saat online
    if (url.hostname.includes('api.aladhan.com')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ code: 503, message: 'Offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((res) => {
                if (event.request.method === 'GET' && url.origin === location.origin) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                }
                return res;
            });
        })
    );
});
