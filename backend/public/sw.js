// ================================================================
// SERVICE WORKER — Csariel's
// Push: sin cambios funcionales.
// Caché: HTML, JS y APIs siempre desde red. CSS con revalidación en
// segundo plano. Imágenes y fuentes con caché.
// ================================================================

const CACHE_NAME = 'csariels-v2';

// ================================================================
// INSTALL
// ================================================================
self.addEventListener('install', () => {
    self.skipWaiting();
});

// ================================================================
// ACTIVATE — borra cachés de versiones anteriores
// ================================================================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ================================================================
// PUSH
// ================================================================
self.addEventListener('push', (event) => {
    let data = {
        title: "◈ Csariel's",
        body: 'Nueva notificación',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        url: '/',
        tag: 'default',
        data: {}
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/badge-72.png',
        tag: data.tag || 'default',
        data: { url: data.url || '/', ...(data.data || {}) },
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: false,
        silent: false,
        renotify: true,
        timestamp: Date.now()
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
});

// ================================================================
// NOTIFICATIONCLICK
// ================================================================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    return client.focus().then((c) => {
                        if (c && 'navigate' in c) return c.navigate(url).catch(() => c);
                        return c;
                    });
                }
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});

// ================================================================
// FETCH
// ================================================================

// Red primero para HTML/JS/API: nunca se sirve una copia vieja
function siempreRed(request) {
    return fetch(request);
}

// Imágenes y fuentes: caché primero (cambian poco)
function cacheFirst(request) {
    return caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
            if (response.ok) {
                const copia = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
            }
            return response;
        });
    });
}

// CSS: muestra la copia guardada y actualiza en segundo plano
function staleWhileRevalidate(request) {
    return caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
            const red = fetch(request).then((response) => {
                if (response.ok) cache.put(request, response.clone());
                return response;
            }).catch(() => cached);
            return cached || red;
        })
    );
}

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Navegación, APIs, HTML y JS: siempre desde red
    if (request.mode === 'navigate') return;
    if (url.pathname.startsWith('/api/')) return;
    if (/\.(html|js|mjs)$/i.test(url.pathname)) return;

    if (/\.css$/i.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf)$/i.test(url.pathname)) {
        event.respondWith(cacheFirst(request));
        return;
    }
});