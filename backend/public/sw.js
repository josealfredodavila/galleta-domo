// ================================================================
// SERVICE WORKER - SARIEL'S ECOSYSTEM
// ================================================================
// Escucha eventos push y muestra notificaciones.
// Redirige al usuario al hacer clic.
// ================================================================

const CACHE_NAME = 'csariels-v1';

// ================================================================
// INSTALL
// ================================================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    self.skipWaiting();
});

// ================================================================
// ACTIVATE
// ================================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activated');
    event.waitUntil(self.clients.claim());
});

// ================================================================
// PUSH — Evento principal
// ================================================================
self.addEventListener('push', (event) => {
    console.log('[SW] Push recibido');

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
            console.warn('[SW] Error parseando push:', e);
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/badge-72.png',
        tag: data.tag || 'default',
        data: {
            url: data.url || '/',
            ...(data.data || {})
        },
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: false,
        silent: false,
        renotify: true,
        timestamp: Date.now()
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ================================================================
// NOTIFICATIONCLICK — Cuando el usuario toca la notificación
// ================================================================
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification click');

    event.notification.close();

    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.navigate(url);
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
    );
});

// ================================================================
// NOTIFICATIONCLOSE
// ================================================================
self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notification cerrada');
});

// ================================================================
// FETCH — Cache simple de assets estáticos
// ================================================================
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|css)$/i.test(url.pathname)) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                }).catch(() => cached);
            })
        );
    }
});