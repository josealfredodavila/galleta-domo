// ================================================================
// SERVICE WORKER — Csariel's · v3 (llamadas con botones)
// ================================================================

const PREFIJO_CACHE = 'csariels-';
const CACHE_NAME = 'csariels-v3';

const ACCIONES_LLAMADA = [
  { action: 'accept', title: '✅ Aceptar' },
  { action: 'reject', title: '❌ Rechazar' }
];

// ================================================================
// INSTALL / ACTIVATE
// ================================================================
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Borra cachés de versiones anteriores para no servir recursos viejos
    const nombres = await caches.keys();
    await Promise.all(
      nombres
        .filter((n) => n.startsWith(PREFIJO_CACHE) && n !== CACHE_NAME)
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// ================================================================
// PUSH: muestra la notificación (con botones si es llamada)
// ================================================================
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  const esLlamada = data?.data?.tipo === 'llamada_entrante';

  // Si el backend no mandó actions para una llamada, las ponemos aquí
  let actions = [];
  if (esLlamada) {
    actions = Array.isArray(data.actions) && data.actions.length
      ? data.actions
      : ACCIONES_LLAMADA;
  } else if (Array.isArray(data.actions)) {
    actions = data.actions;
  }

  const opciones = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag,
    renotify: !!data.renotify,
    requireInteraction: !!data.requireInteraction || esLlamada,
    vibrate: data.vibrate || [200, 100, 200],
    timestamp: data.timestamp,
    data: { url: data.url || '/', ...(data.data || {}) },
    actions
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "◈ Csariel's", opciones)
  );
});

// ================================================================
// NOTIFICATIONCLICK: botones Aceptar / Rechazar y clic en el cuerpo
// ================================================================
self.addEventListener('notificationclick', (event) => {
  const info = event.notification.data || {};
  const esLlamada = info.tipo === 'llamada_entrante';
  event.notification.close();

  // Rechazar: por ahora solo cierra la notificación.
  // Pendiente: avisar al backend (ver nota arriba).
  if (event.action === 'reject') return;

  let url = info.url || '/';
  if (event.action === 'accept' && esLlamada) {
    url += (url.includes('?') ? '&' : '?') + 'accion=aceptar';
  }
  const destino = new URL(url, self.location.origin);

  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const ventana = ventanas.find((c) => c.url.startsWith(self.location.origin));

    if (!ventana) {
      return self.clients.openWindow(destino.href);
    }

    await ventana.focus();

    const mismaPagina = new URL(ventana.url).pathname === destino.pathname;
    if (mismaPagina) {
      // La página ya está abierta: le avisamos sin recargarla
      ventana.postMessage({
        tipo: 'notificacion_click',
        accion: event.action || 'open',
        llamadaId: info.llamadaId || null,
        url: destino.href
      });
    } else {
      // Otra página: la navegamos al destino
      try {
        await ventana.navigate(destino.href);
      } catch (e) {
        return self.clients.openWindow(destino.href);
      }
    }
  })());
});

// ================================================================
// FETCH: caché de estáticos (no toca /api, HTML ni JS)
// ================================================================
function cacheFirst(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
    })
  );
}

function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      const red = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
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
  }
});