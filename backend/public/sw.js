// ================================================================
// SERVICE WORKER — Csariel's · v2.5
// ================================================================

const CACHE_NAME = 'csariels-v2';

// Forzar actualización inmediata
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ================================================================
// PUSH: muestra la notificación con botones
// ================================================================
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

  const opciones = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag,
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction,
    vibrate: data.vibrate || [200, 100, 200],
    timestamp: data.timestamp,
    data: { url: data.url || '/', ...(data.data || {}) },
    // Aquí se leen los botones que envía el backend
    actions: Array.isArray(data.actions) ? data.actions : []
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "◈ Csariel's", opciones)
  );
});

// ================================================================
// CLICK: botones Aceptar / Rechazar y click en el cuerpo
// ================================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Rechazar: no abrimos la app.
  if (event.action === 'reject') return;

  const info = event.notification.data || {};
  let url = info.url || '/';
  
  // Si acepta, agregamos el parámetro a la URL
  if (event.action === 'accept') {
    url += (url.includes('?') ? '&' : '?') + 'accion=aceptar';
  }
  
  const destino = new URL(url, self.location.origin).href;

  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of ventanas) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus();
        c.postMessage({ tipo: 'notificacion_click', accion: event.action || 'open', url: destino });
        return;
      }
    }
    return self.clients.openWindow(destino);
  })());
});

// ================================================================
// FETCH (Manejo de caché)
// ================================================================
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